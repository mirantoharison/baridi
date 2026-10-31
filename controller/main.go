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
	"fanctl/elevation"
	"fanctl/fan"
	"fanctl/power"

	"golang.org/x/sys/windows/svc"
)

const defaultAddr = "127.0.0.1:8787"

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

	controller := fan.NewController(fan.LoadDLL())
	controller.Init()
	defer controller.Cleanup()

	store, err := fan.NewProfileStore(filepath.Join(exeDir, "profiles.json"))
	if err != nil {
		return fmt.Errorf("profiles: %w", err)
	}

	server := api.NewServer(controller, store, onQuit)

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
	if p, ok := store.Get(prefs.Profile); ok {
		controller.SetActiveProfile(p)
	}
	server.OnCurveMode(func(mode string) { prefs.CurveMode = mode; save() })
	server.OnProfile(func(id string) { prefs.Profile = id; save() })

	// IMPORTANT : démarrage en Auto. Sans UI ouverte (service au boot), personne ne choisirait
	// de mode, et le ventilateur resterait hors de la gestion du firmware sans être piloté.
	controller.StartAuto()

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
