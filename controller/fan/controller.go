package fan

import (
	"fmt"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

type Controller struct {
	mu   sync.Mutex
	Mode string
	// CurveMode : "steep" (paliers) ou "smooth" (interpolation linéaire entre les points).
	CurveMode string
	// HysteresisC : degrés de baisse requis avant de ralentir le ventilateur (0 = désactivée). Voir shouldApplyTarget.
	HysteresisC int
	// Smoothing : "fast", "normal" ou "slow" — échelle appliquée au pas de transition des profils.
	Smoothing string
	// TempFilterS : fenêtre en secondes de la moyenne glissante sur la température en mode Auto (0 = désactivée).
	TempFilterS int
	// Dernières mesures de la sonde de fond (voir sensors.go) : /status et la boucle Auto lisent ce cache
	// au lieu d'appeler la DLL, dont chaque appel est lent et sérialisé.
	sensTemp   uintptr
	sensRPM    uintptr
	sensReady  bool
	fan2RPM    uintptr
	fan2Probed bool
	// Commande du second ventilateur (voir fan2.go) : mode, consigne manuelle, dernier PWM écrit, mode test actif sur l'index 1.
	fan2Mode    string
	fan2Percent uintptr
	fan2PWM     uintptr
	fan2TestOn  bool
	// biosOverride : vrai quand le mode test a été coupé en revenant au firmware APRÈS une commande du ventilateur 2.
	// Le firmware pilote alors les DEUX ventilateurs et la courbe du profil est ignorée (voir fan2.go).
	biosOverride bool
	// dll sérialise les séquences qui changent d'index de ventilateur (index 1, opération, retour à 0) : aucune autre
	// écriture ne doit s'intercaler, sinon une consigne partirait sur le mauvais ventilateur.
	dll sync.Mutex
	// quit est fermé par Cleanup : la sonde ne doit plus toucher à la DLL après ShutdownWinIo.
	quit          chan struct{}
	ActiveProfile Profile
	CurrentPWM    uintptr
	// rampStarted : vrai dès la première transition (voir transitionConfig).
	rampStarted    bool
	targetPWM      uintptr
	stopAuto       chan bool
	stopTransition chan bool
	SetFanPWM      *windows.LazyProc
	ReadRPM        *windows.LazyProc
	ReadTemp       *windows.LazyProc
	SetFanIndex    *windows.LazyProc
	SetFanTestMode *windows.LazyProc
	ShutdownWinIo  *windows.LazyProc
	// FanCounts : fonction de la DLL qui annonce le nombre de ventilateurs (voir readFanCount).
	FanCounts *windows.LazyProc
	// fanCount : nombre annoncé par la DLL au démarrage, ou unknownFanCount si elle ne le dit pas.
	fanCount int
	// TempSource : température qui pilote la courbe du ventilateur 1 (« cpu » ou « max », voir tempsource.go).
	TempSource string
	// gpuTempFn : lecture de la température GPU, branchée par main (0 = indisponible).
	gpuTempFn func() int
	// fan2Curve : courbe propre du second ventilateur (mode « curve »).
	fan2Curve Fan2CurveConfig
	// fanTest : test actif des ventilateurs (voir fantest.go).
	fanTest fanTestRun
	// stats : statistiques de session (voir stats.go). extra : capteurs supplémentaires de la DLL (voir extra.go).
	stats *sessionStats
	extra *extraState
}

func NewController(dll *windows.LazyDLL) *Controller {
	return &Controller{
		Mode:           "idle",
		CurveMode:      CurveSteep,
		Smoothing:      SmoothingNormal,
		quit:           make(chan struct{}),
		fan2Mode:       Fan2Firmware,
		ActiveProfile:  getSystemProfile("balanced"),
		CurrentPWM:     0,
		targetPWM:      0,
		ShutdownWinIo:  dll.NewProc("ShutdownWinIo"),
		SetFanTestMode: dll.NewProc("HealthyTable_SetFanTestMode"),
		SetFanIndex:    dll.NewProc("HealthyTable_SetFanIndex"),
		SetFanPWM:      dll.NewProc("HealthyTable_SetFanPwmDuty"),
		ReadTemp:       dll.NewProc("Thermal_Read_Cpu_Temperature"),
		ReadRPM:        dll.NewProc("HealthyTable_FanRPM"),
		FanCounts:      dll.NewProc("HealthyTable_FanCounts"),
		fanCount:       unknownFanCount,
		stats:          newSessionStats(),
		extra:          newExtraState(dll),
	}
}

func (c *Controller) Init() {
	dll := windows.NewLazyDLL("AsusWinIO64.dll")
	initWinIo := dll.NewProc("InitializeWinIo")
	ret := CallProc("InitializeWinIo", initWinIo)
	if ret == 0 {
		panic("InitializeWinIo a échoué malgré les droits SYSTEM !")
	}
	CallProc("SetFanTestMode", c.SetFanTestMode, 1)
	CallProc("SetFanIndex", c.SetFanIndex, 0)
	c.fanCount = readFanCount(c.FanCounts)
}

func (c *Controller) Cleanup() {
	fmt.Println("\nCleaning up...")

	// Arrête la sonde avant tout : elle ne doit plus appeler la DLL pendant la restauration.
	select {
	case <-c.quit: // déjà fermé : Cleanup appelé deux fois ne doit pas paniquer
	default:
		close(c.quit)
	}

	// Rend le second ventilateur au firmware AVANT tout le reste : sans cela il resterait figé sur sa dernière consigne.
	c.dll.Lock()
	c.releaseFan2Locked()
	c.dll.Unlock()

	c.mu.Lock()
	wasAuto := c.Mode == "auto"
	c.mu.Unlock()

	if wasAuto {
		c.stopAuto <- true
	}

	temp := CallProc("ReadCpuTemp", c.ReadTemp)
	balanced := getSystemProfile("balanced")
	target := balanced.GetPWM(int(temp))
	percent := target * 100 / 255
	fmt.Printf("Restoring fan → Temp: %d°C → PWM: %d (%d%%)\n", temp, target, percent)

	// Transition bloquante avec la config du profil balanced
	c.transitionBlocking(target, balanced.Transition)

	CallProc("SetFanTestMode", c.SetFanTestMode, 0)
	CallProc("ShutdownWinIo", c.ShutdownWinIo)

	fmt.Println("Done ✓")
}

// maxPWM : valeur maximale du PWM (0-255). Utilisée comme « pas » pour atteindre une cible en un seul palier.
const maxPWM uintptr = 255

// transitionConfig retourne la config de transition du profil actif
// avec fallback sur defaultTransition si les valeurs sont invalides
func (c *Controller) transitionConfig() (step uintptr, tick time.Duration) {
	c.mu.Lock()
	t := c.ActiveProfile.Transition
	smoothing := c.Smoothing
	// La toute première transition après le démarrage part de CurrentPWM = 0 alors que le ventilateur peut déjà
	// être arrêté sur une machine chaude : la lisser depuis 0 le laissait à l'arrêt de longues secondes (processeur
	// monté de 70° à 90° au démarrage avec le lissage « Doux »). On l'applique donc d'un seul pas.
	firstRamp := !c.rampStarted
	c.rampStarted = true
	c.mu.Unlock()
	if firstRamp {
		return maxPWM, time.Duration(defaultTransition.TickMs) * time.Millisecond
	}

	step = uintptr(t.Step)
	tick = time.Duration(t.TickMs) * time.Millisecond

	if step == 0 {
		step = uintptr(defaultTransition.Step)
	}
	if tick == 0 {
		tick = time.Duration(defaultTransition.TickMs) * time.Millisecond
	}
	// IMPORTANT : le lissage ne s'applique qu'ici, pas à transitionBlocking (Cleanup) : à l'arrêt,
	// le ventilateur doit revenir vite à un état sûr, quel que soit le réglage choisi.
	step = scaleStep(step, smoothing)
	return
}

// transitionTo lance une goroutine qui amène CurrentPWM vers target progressivement.
// Si une transition est déjà en cours, elle est annulée et remplacée.
func (c *Controller) transitionTo(target uintptr) {
	step, tick := c.transitionConfig()
	c.transitionWith(target, step, tick)
}

// manualRampStep : pas PWM par tick pour une vitesse MANUELLE. Une consigne choisie à la main (curseur, raccourci
// clavier) doit être suivie vite : avec le pas lissé du profil, redescendre de 75 % à 10 % prenait plusieurs minutes,
// chaque pas coûtant un appel lent à la DLL. À ce pas, le parcours complet fait une dizaine de ticks.
const manualRampStep uintptr = 24

// transitionWith est transitionTo avec un pas et un tick imposés.
func (c *Controller) transitionWith(target, step uintptr, tick time.Duration) {
	c.mu.Lock()
	c.targetPWM = target

	if c.stopTransition != nil {
		select {
		case c.stopTransition <- true:
		default:
		}
	}
	stop := make(chan bool, 1)
	c.stopTransition = stop
	c.mu.Unlock()

	go func() {
		for {
			c.mu.Lock()
			cur := c.CurrentPWM
			tgt := c.targetPWM
			c.mu.Unlock()

			if cur == tgt {
				return
			}

			next := nextPWM(cur, tgt, step)

			c.setPWM(next)

			c.mu.Lock()
			c.CurrentPWM = next
			c.mu.Unlock()

			select {
			case <-stop:
				return
			case <-time.After(tick):
			}
		}
	}()
}

// transitionBlocking est utilisée dans Cleanup — bloque jusqu'à la fin de la transition.
func (c *Controller) transitionBlocking(target uintptr, t TransitionConfig) {
	step := uintptr(t.Step)
	tick := time.Duration(t.TickMs) * time.Millisecond

	if step == 0 {
		step = uintptr(defaultTransition.Step)
	}
	if tick == 0 {
		tick = time.Duration(defaultTransition.TickMs) * time.Millisecond
	}

	for {
		c.mu.Lock()
		cur := c.CurrentPWM
		c.mu.Unlock()

		if cur == target {
			return
		}

		next := nextPWM(cur, target, step)

		c.setPWM(next)

		c.mu.Lock()
		c.CurrentPWM = next
		c.mu.Unlock()

		time.Sleep(tick)
	}
}

// nextPWM calcule la prochaine valeur PWM vers target avec un pas de step
func nextPWM(cur, target, step uintptr) uintptr {
	if cur < target {
		next := cur + step
		if next > target {
			return target
		}
		return next
	}
	if cur < step {
		return target
	}
	next := cur - step
	if next < target {
		return target
	}
	return next
}

func (c *Controller) SetManual(percent uintptr) uintptr {
	c.StopAuto()

	pwm := PercentToPWM(percent)

	c.mu.Lock()
	c.Mode = "manual"
	c.mu.Unlock()

	c.transitionWith(pwm, manualRampStep, time.Duration(defaultTransition.TickMs)*time.Millisecond)

	return pwm
}

func (c *Controller) StartAuto() {
	c.mu.Lock()
	if c.Mode == "auto" {
		c.mu.Unlock()
		return
	}
	c.Mode = "auto"
	c.stopAuto = make(chan bool, 1)
	c.mu.Unlock()

	go func() {
		// lastKey/lastChangeTemp : état propre à cette boucle pour l'hystérésis (voir shouldApplyTarget).
		var lastKey string
		var lastChangeTemp int
		// recent : dernières mesures brutes, pour la moyenne glissante (voir filterTemp).
		var recent []uintptr
		for {
			select {
			case <-c.stopAuto:
				return
			default:
				// Température du cache de la sonde : un appel direct à la DLL ferait la queue derrière tous les autres.
				rawTemp := c.cachedTemp()
				c.mu.Lock()
				filterS := c.TempFilterS
				c.mu.Unlock()
				temp := filterTemp(&recent, rawTemp, filterS)

				c.mu.Lock()
				var target uintptr
				if c.CurveMode == CurveSmooth {
					target = c.ActiveProfile.GetPWMSmooth(int(temp))
				} else {
					target = c.ActiveProfile.GetPWM(int(temp))
				}
				currentTarget := c.targetPWM
				hysteresis := c.HysteresisC
				key := c.ActiveProfile.ID + "|" + c.CurveMode
				c.mu.Unlock()

				// Un changement de profil ou de mode de courbe repart d'une base neuve et s'applique tout de suite.
				forced := key != lastKey
				if forced {
					lastKey = key
					lastChangeTemp = int(temp)
				}

				// Lance la transition seulement si la cible a changé (et que l'hystérésis l'autorise)
				if target != currentTarget && shouldApplyTarget(target, currentTarget, int(temp), lastChangeTemp, hysteresis, forced) {
					c.transitionTo(target)
					lastChangeTemp = int(temp)
				}

				time.Sleep(2 * time.Second)
			}
		}
	}()
}

func (c *Controller) StopAuto() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.Mode == "auto" {
		c.stopAuto <- true
		c.Mode = "idle"
	}
}

const (
	CurveSteep  = "steep"
	CurveSmooth = "smooth"
)

// SetCurveMode choisit comment la température est convertie en vitesse (voir CurveMode).
func (c *Controller) SetCurveMode(mode string) error {
	if mode != CurveSteep && mode != CurveSmooth {
		return fmt.Errorf("unknown curve mode %q", mode)
	}
	c.mu.Lock()
	c.CurveMode = mode
	c.mu.Unlock()
	return nil
}

func (c *Controller) SetActiveProfile(p Profile) {
	c.mu.Lock()
	c.ActiveProfile = p
	c.mu.Unlock()
}

func (c *Controller) Status() (temp, rpm, pwm, percent uintptr) {
	// Mesures issues du cache de la sonde (au plus quelques secondes de retard) : /status répond sans toucher à la DLL.
	temp, rpm = c.cachedTempRPM()

	c.mu.Lock()
	pwm = c.CurrentPWM
	c.mu.Unlock()

	percent = pwm * 100 / 255
	return
}
