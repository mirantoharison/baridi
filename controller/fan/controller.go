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
	CurveMode      string
	ActiveProfile  Profile
	CurrentPWM     uintptr
	targetPWM      uintptr
	stopAuto       chan bool
	stopTransition chan bool
	SetFanPWM      *windows.LazyProc
	ReadRPM        *windows.LazyProc
	ReadTemp       *windows.LazyProc
	SetFanIndex    *windows.LazyProc
	SetFanTestMode *windows.LazyProc
	ShutdownWinIo  *windows.LazyProc
}

func NewController(dll *windows.LazyDLL) *Controller {
	return &Controller{
		Mode:           "idle",
		CurveMode:      CurveSteep,
		ActiveProfile:  getSystemProfile("balanced"),
		CurrentPWM:     0,
		targetPWM:      0,
		ShutdownWinIo:  dll.NewProc("ShutdownWinIo"),
		SetFanTestMode: dll.NewProc("HealthyTable_SetFanTestMode"),
		SetFanIndex:    dll.NewProc("HealthyTable_SetFanIndex"),
		SetFanPWM:      dll.NewProc("HealthyTable_SetFanPwmDuty"),
		ReadTemp:       dll.NewProc("Thermal_Read_Cpu_Temperature"),
		ReadRPM:        dll.NewProc("HealthyTable_FanRPM"),
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
}

func (c *Controller) Cleanup() {
	fmt.Println("\nCleaning up...")

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

// transitionConfig retourne la config de transition du profil actif
// avec fallback sur defaultTransition si les valeurs sont invalides
func (c *Controller) transitionConfig() (step uintptr, tick time.Duration) {
	c.mu.Lock()
	t := c.ActiveProfile.Transition
	c.mu.Unlock()

	step = uintptr(t.Step)
	tick = time.Duration(t.TickMs) * time.Millisecond

	if step == 0 {
		step = uintptr(defaultTransition.Step)
	}
	if tick == 0 {
		tick = time.Duration(defaultTransition.TickMs) * time.Millisecond
	}
	return
}

// transitionTo lance une goroutine qui amène CurrentPWM vers target progressivement.
// Si une transition est déjà en cours, elle est annulée et remplacée.
func (c *Controller) transitionTo(target uintptr) {
	step, tick := c.transitionConfig()

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

			CallProc("SetFanPwmDuty", c.SetFanPWM, next)

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

		CallProc("SetFanPwmDuty", c.SetFanPWM, next)

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

	c.transitionTo(pwm)

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
		for {
			select {
			case <-c.stopAuto:
				return
			default:
				temp := CallProc("ReadCpuTemp", c.ReadTemp)

				c.mu.Lock()
				var target uintptr
				if c.CurveMode == CurveSmooth {
					target = c.ActiveProfile.GetPWMSmooth(int(temp))
				} else {
					target = c.ActiveProfile.GetPWM(int(temp))
				}
				currentTarget := c.targetPWM
				c.mu.Unlock()

				// Lance la transition seulement si la cible a changé
				if target != currentTarget {
					c.transitionTo(target)
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
	temp = CallProc("ReadCpuTemp", c.ReadTemp)
	rpm = CallProc("ReadFanRPM", c.ReadRPM, 0)

	c.mu.Lock()
	pwm = c.CurrentPWM
	c.mu.Unlock()

	percent = pwm * 100 / 255
	return
}
