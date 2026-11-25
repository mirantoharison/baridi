// Contrôleur ventilateur v2.
//
// Deux modes de fonctionnement, même code (voir serve) :
//   - sidecar : lancé par l'app Tauri (relance en SYSTEM via PsExec), meurt avec l'UI ;
//   - service Windows « FanControllerCore » : tourne en LocalSystem dès le démarrage de la machine,
//     sans interface, et l'UI s'y connecte quand elle est ouverte.
//
// Sous-commandes : install | uninstall | status (gestion du service).
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"

	"fanctl/api"
	"fanctl/auto"
	"fanctl/elevation"
	"fanctl/fan"
	"fanctl/history"
	"fanctl/hw"
	"fanctl/power"

	"golang.org/x/sys/windows/svc"
)

const defaultAddr = "127.0.0.1:8787"

// version du contrôleur (route /info). À garder alignée sur package.json et tauri.conf.json.
const version = "2.0.0"

func main() {
	// Lancé par le gestionnaire de services : pas de console, pas de flags.
	if isService, err := svc.IsWindowsService(); err == nil && isService {
		runAsService(defaultAddr)
		return
	}

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "install":
			exitOn(installService(), "service installé et démarré")
			return
		case "uninstall":
			exitOn(uninstallService(), "service supprimé")
			return
		case "status":
			fmt.Println(serviceStatus())
			return
		}
	}

	elevated := flag.Bool("elevated", false, "déjà relancé en SYSTEM")
	parentPID := flag.Int("parent-pid", 0, "quitte quand ce PID disparaît")
	addr := flag.String("addr", defaultAddr, "adresse d'écoute")
	flag.Parse()

	// IMPORTANT : la DLL ASUS exige SYSTEM. On relance via PsExec en
	// propageant --parent-pid pour que le sidecar meure avec l'UI.
	if !*elevated {
		if !elevation.IsAdmin() {
			log.Println("Droits administrateur requis")
			os.Exit(1)
		}
		if !elevation.IsSystem() {
			exe, _ := os.Executable()
			psexec := filepath.Join(filepath.Dir(exe), "PsExec.exe")
			cmd := exec.Command(psexec, "-s", "-accepteula", "-nobanner", exe,
				"--elevated", "--parent-pid", strconv.Itoa(*parentPID), "--addr", *addr)
			cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
			if err := cmd.Run(); err != nil {
				log.Printf("PsExec: %v", err)
				os.Exit(1)
			}
			os.Exit(0)
		}
	}

	stop := make(chan struct{})
	var once sync.Once
	quit := func() { once.Do(func() { close(stop) }) }

	if *parentPID > 0 {
		go watchParent(*parentPID, quit)
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		quit()
	}()

	if err := serve(*addr, stop, quit); err != nil {
		log.Println(err)
		os.Exit(1)
	}
	fmt.Println("bye")
}

func exitOn(err error, okMessage string) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "erreur :", err)
		os.Exit(1)
	}
	fmt.Println(okMessage)
}

// serve est le cœur commun au sidecar et au service : matériel, profils, API HTTP.
// Il bloque jusqu'à la fermeture de stop (ou une erreur du serveur), puis restaure un état sûr.
// onQuit alimente POST /quit ; nil = endpoint désactivé (service : l'UI ne doit pas pouvoir l'arrêter).
func serve(addr string, stop <-chan struct{}, onQuit func()) error {
	// Ancrage sur l'exe (jamais cwd) : la DLL est chargée depuis le même dossier.
	// Indispensable en service, dont le dossier courant est System32.
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exeDir := filepath.Dir(exe)
	if err := os.Chdir(exeDir); err != nil {
		return err
	}

	// Clé d'API avant tout accès au matériel : si elle ne peut pas être créée ou protégée, on refuse de démarrer
	// sans avoir touché aux ventilateurs.
	apiKey, err := loadOrCreateKey(filepath.Join(exeDir, keyFileName))
	if err != nil {
		return fmt.Errorf("api key: %w", err)
	}

	controller := fan.NewController(fan.LoadDLL())
	controller.Init()
	defer controller.Cleanup()

	store, err := fan.NewProfileStore(filepath.Join(exeDir, "profiles.json"))
	if err != nil {
		return fmt.Errorf("profiles: %w", err)
	}

	server := api.NewServer(controller, store, onQuit)
	server.SetKey(apiKey)

	// Mesures du processeur et de la carte graphique pour l'affichage : en arrière-plan, et seulement tant que
	// l'interface les demande (voir hw.idleAfter).
	monitor := hw.NewMonitor()
	monitorStop := make(chan struct{})
	defer close(monitorStop)
	go monitor.Run(monitorStop)
	server.SetMonitor(monitor)

	// Préférences persistées : mode de courbe et dernier profil actif.
	settingsPath := filepath.Join(exeDir, "settings.json")
	prefs := loadSettings(settingsPath)
	save := func() {
		if err := saveSettings(settingsPath, prefs); err != nil {
			log.Println("settings:", err)
		}
	}
	if prefs.CurveMode != "" {
		if err := controller.SetCurveMode(prefs.CurveMode); err != nil {
			log.Println("settings:", err)
		}
	}
	if err := controller.SetTuning(fan.Tuning{HysteresisC: prefs.HysteresisC, Smoothing: prefs.Smoothing, TempFilterS: prefs.TempFilterS}); err != nil {
		log.Println("settings:", err) // valeurs invalides dans le fichier : on garde les défauts neutres
	}
	if p, ok := store.Get(prefs.Profile); ok {
		controller.SetActiveProfile(p)
	}
	server.OnCurveMode(func(mode string) { prefs.CurveMode = mode; save() })
	server.OnTuning(func(t fan.Tuning) {
		prefs.HysteresisC = t.HysteresisC
		prefs.Smoothing = t.Smoothing
		prefs.TempFilterS = t.TempFilterS
		save()
	})
	server.SetInfo(api.Info{
		Version:      version,
		PID:          os.Getpid(),
		Dir:          exeDir,
		SettingsPath: settingsPath,
		ProfilesPath: filepath.Join(exeDir, "profiles.json"),
	})
	// Température GPU pour la courbe : jamais mesurée sur une carte endormie (voir hw.Monitor.GPUTemp).
	controller.SetGPUTempProvider(monitor.GPUTemp)
	if err := controller.SetTempSource(prefs.TempSource); err != nil {
		log.Println("settings:", err)
	}
	server.OnTempSource(func(source string) { prefs.TempSource = source; save() })
	server.OnFan2Curve(func(cfg fan.Fan2CurveConfig) { prefs.Fan2Curve = cfg; save() })
	server.OnProfile(func(id string) { prefs.Profile = id; save() })
	server.OnFan2Mode(func(mode string) {
		// Seuls « follow » et « curve » survivent à un redémarrage : une consigne manuelle fixe ne doit jamais être
		// réappliquée seule, alors que ces deux modes suivent la température.
		if mode != fan.Fan2Follow && mode != fan.Fan2Curve {
			mode = fan.Fan2Firmware
		}
		prefs.Fan2Mode = mode
		save()
	})

	// Automatisation : change de profil selon le contexte. Le profil qu'elle pose est temporaire (voir ApplyProfile).
	engine := auto.New(filepath.Join(exeDir, "automation.json"), auto.Host{
		ActiveProfile:  func() string { return controller.ActiveProfile.ID },
		ProfileExists:  func(id string) bool { _, ok := store.Get(id); return ok },
		ActivePlanGUID: hw.CurrentPowerPlanGUID,
		ApplyPlanGUID:  hw.SetPowerPlanByGUID,
		PlanGUID:       hw.PlanGUIDByName,
		ApplyProfile: func(id string) error {
			p, ok := store.Get(id)
			if !ok {
				return fmt.Errorf("profil inconnu : %s", id)
			}
			// IMPORTANT : on ne mémorise PAS ce profil dans settings.json. Il est temporaire : au prochain démarrage,
			// c'est celui choisi par l'utilisateur qui doit revenir, pas celui d'une règle.
			controller.SetActiveProfile(p)
			return nil
		},
	})
	hw.SetIconCacheDir(filepath.Join(exeDir, "icons"))
	autoStop := make(chan struct{})
	defer close(autoStop)
	go engine.Run(autoStop)
	server.SetAutomation(engine)

	// Historique long : une mesure toutes les 30 s dans history.jsonl, pour les courbes sur plusieurs jours, la
	// consommation de la batterie et le diagnostic d'encrassement.
	if store, err := history.Open(filepath.Join(exeDir, "history.jsonl")); err != nil {
		log.Println("history:", err)
	} else {
		server.SetHistory(store)
		historyStop := make(chan struct{})
		defer close(historyStop)
		go store.Run(historyStop, func() history.Sample { return collectSample(controller, monitor) })
	}

	// Santé de la batterie : un relevé par jour (usure, capacité, cycles) pour suivre son vieillissement sur des mois.
	health := history.OpenHealth(filepath.Join(exeDir, "battery_health.jsonl"))
	server.SetHealth(health)
	healthStop := make(chan struct{})
	defer close(healthStop)
	go health.Run(healthStop, func() (float64, int, int, bool) {
		d, ok := hw.ReadBatteryDetails()
		return d.WearPercent, d.FullChargedMWh, d.CycleCount, ok
	})

	// IMPORTANT : démarrage en Auto. Sans UI ouverte (service au boot), personne ne choisirait
	// de mode, et le ventilateur resterait hors de la gestion du firmware sans être piloté.
	controller.StartAuto()
	// Sonde unique des capteurs : /status et la boucle Auto lisent son cache au lieu d'appeler la DLL (lente).
	controller.StartSensorPoll()
	// Mode « suivre » mémorisé : repris tout de suite, sinon le ventilateur 2 reste au firmware jusqu'à ce que
	// l'interface le redemande (en service, personne n'ouvre l'interface au démarrage).
	if prefs.Fan2Mode == fan.Fan2Follow {
		if err := controller.SetFan2(fan.Fan2Follow, 0); err != nil {
			log.Println("settings:", err)
		}
	}

	if prefs.Fan2Mode == fan.Fan2Curve {
		if err := controller.SetFan2Curve(prefs.Fan2Curve); err != nil {
			log.Println("settings:", err) // courbe illisible ou refusée : le ventilateur 2 reste au firmware
		}
	}

	go power.WatchPowerEvents(func(e power.PowerEvent) {
		switch e {
		case power.PowerSuspend:
			controller.StopAuto()
		case power.PowerResume:
			controller.StartAuto()
		}
	})

	failed := make(chan error, 1)
	go func() { failed <- server.Start(addr) }()

	select {
	case <-stop:
		return nil
	case err := <-failed:
		return fmt.Errorf("server: %w", err)
	}
}

// collectSample rassemble une mesure pour l'historique.
//
// IMPORTANT : le processeur et la GPU ne sont repris que si le moniteur a mesuré récemment (Latest). Les mesurer ici
// forcerait des lectures NVML en permanence et empêcherait la carte de dormir. Les champs absents restent à 0 : ils sont
// ignorés dans les moyennes.
func collectSample(controller *fan.Controller, monitor *hw.Monitor) history.Sample {
	temp, rpm, _, percent := controller.Status()
	smp := history.Sample{Temp: int(temp), Percent: int(percent), RPM: int(rpm)}
	if rpm2, ok := controller.Fan2(); ok {
		smp.RPM2 = int(rpm2)
	}
	if snap, fresh := monitor.Latest(); fresh {
		smp.CPUUsage = int(snap.CPU.UsagePercent + 0.5)
		smp.ThrCPU = snap.CPU.Throttled
		if g := snap.GPU; g != nil && !g.Asleep {
			smp.GPUTemp, smp.GPUUsage, smp.GPUPower = g.TempC, g.UsagePercent, g.PowerW
			for _, reason := range g.Throttle {
				// « sw_thermal » est le plafond de plateforme que les portables déclarent en permanence : ce n'est pas une limitation.
				if reason != "sw_thermal" {
					smp.ThrGPU = true
				}
			}
		}
	}
	if bat := hw.ReadBattery(); bat.Present {
		smp.Battery, smp.Plugged = bat.Percent, bat.PluggedIn
		if d, ok := hw.ReadBatteryDetails(); ok && d.HasPower {
			smp.BatPower = d.PowerW
		}
	}
	return smp
}
