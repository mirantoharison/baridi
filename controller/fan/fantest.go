package fan

import (
	"errors"
	"sync"
	"time"
)

// Test actif des ventilateurs : monte chaque ventilateur par paliers et vérifie que le RPM suit.
//
// IMPORTANT : pendant le test, la boucle Auto est suspendue et les deux ventilateurs reçoivent une consigne fixe. Elle est
// toujours au moins de 30 %, et le test s'arrête (en rendant la main) dès que le processeur atteint fanTestAbortTempC.
// À la fin — normale, annulée ou en erreur — le mode d'avant (Auto ou Manuel) est restauré, ainsi que celui du ventilateur 2
// (sauf « firmware », remplacé par « suivre le 1 » : voir restore).

var fanTestStepsPercent = []uintptr{30, 60, 100}

const (
	// fanTestHold : durée d'un palier. Le RPM met quelques secondes à se stabiliser et la sonde ne lit que toutes les 2 s.
	fanTestHold = 9 * time.Second
	// fanTestStartMaxTempC : au-dessus, on refuse de démarrer (la machine est déjà chaude, un test n'a pas à s'y ajouter).
	fanTestStartMaxTempC = 75
	// fanTestAbortTempC : au-dessus, on interrompt le test en cours.
	fanTestAbortTempC = 85
)

// FanTestStep est le résultat d'un palier.
type FanTestStep struct {
	Percent int `json:"percent"`
	RPM1    int `json:"rpm1"`
	// RPM2 vaut 0 s'il n'y a pas de second ventilateur.
	RPM2 int `json:"rpm2"`
}

// FanTestState est l'état du test, relu par l'interface pendant qu'il tourne.
type FanTestState struct {
	// Status : « idle » (jamais lancé), « running », « done », « aborted » (arrêt de sécurité) ou « failed ».
	Status string `json:"status"`
	// Step : palier en cours (0 = premier) ; Steps : résultats déjà mesurés.
	Step  int           `json:"step"`
	Total int           `json:"total"`
	Steps []FanTestStep `json:"steps"`
	// Verdict1 et Verdict2 : « ok », « weak » (monte trop peu), « stuck » (ne réagit pas à la consigne) ou « dead »
	// (presque à l'arrêt à pleine consigne). Vides tant que le test n'est pas terminé.
	Verdict1 string `json:"verdict1,omitempty"`
	Verdict2 string `json:"verdict2,omitempty"`
	// Message : explication d'un arrêt (température, erreur).
	Message string `json:"message,omitempty"`
}

type fanTestRun struct {
	mu    sync.Mutex
	state FanTestState
}

// FanTestState renvoie l'état courant du test.
func (c *Controller) FanTestState() FanTestState {
	c.fanTest.mu.Lock()
	defer c.fanTest.mu.Unlock()
	s := c.fanTest.state
	s.Steps = append([]FanTestStep{}, s.Steps...) // [] et non null : l'interface lit toujours un tableau
	if s.Status == "" {
		s.Status = "idle"
	}
	return s
}

func (c *Controller) setFanTest(update func(*FanTestState)) {
	c.fanTest.mu.Lock()
	update(&c.fanTest.state)
	c.fanTest.mu.Unlock()
}

// StartFanTest lance le test en arrière-plan. Refusé s'il tourne déjà ou si la machine est trop chaude.
func (c *Controller) StartFanTest() error {
	c.fanTest.mu.Lock()
	if c.fanTest.state.Status == "running" {
		c.fanTest.mu.Unlock()
		return errors.New("un test est déjà en cours")
	}
	c.fanTest.mu.Unlock()
	if temp := c.cachedTemp(); temp >= fanTestStartMaxTempC {
		return errors.New("le processeur est déjà trop chaud pour lancer un test")
	}
	c.setFanTest(func(s *FanTestState) {
		*s = FanTestState{Status: "running", Total: len(fanTestStepsPercent)}
	})
	go c.runFanTest()
	return nil
}

func (c *Controller) runFanTest() {
	// État à restaurer.
	c.mu.Lock()
	prevMode := c.Mode
	prevPercent := c.CurrentPWM * 100 / 255
	prevFan2 := c.fan2Mode
	prevFan2Percent := c.fan2Percent
	c.mu.Unlock()
	hasFan2 := c.fanCount >= 2

	restore := func() {
		if hasFan2 {
			switch prevFan2 {
			case Fan2Manual:
				_ = c.SetFan2(Fan2Manual, prevFan2Percent)
			case Fan2Follow, Fan2Curve:
				_ = c.SetFan2(prevFan2, 0)
			default:
				// IMPORTANT : on ne rend PAS le ventilateur 2 au firmware. Couper son mode test libère aussi le ventilateur 1
				// (voir fan2.go) : la courbe du profil serait ignorée après un simple test. « Suivre le 1 » garde les deux
				// ventilateurs sous le contrôle de l'application ; ce choix n'est pas mémorisé (il redevient « firmware » au
				// prochain démarrage).
				_ = c.SetFan2(Fan2Follow, 0)
			}
		}
		if prevMode == "auto" {
			c.StartAuto()
		} else {
			c.SetManual(prevPercent)
		}
	}
	defer restore()

	for i, percent := range fanTestStepsPercent {
		c.setFanTest(func(s *FanTestState) { s.Step = i })
		c.SetManual(percent) // suspend la boucle Auto
		if hasFan2 {
			if err := c.SetFan2(Fan2Manual, percent); err != nil {
				c.setFanTest(func(s *FanTestState) { s.Status, s.Message = "failed", err.Error() })
				return
			}
		}
		// Attente par tranches : on surveille la température et l'arrêt du contrôleur pendant le palier.
		deadline := time.Now().Add(fanTestHold)
		for time.Now().Before(deadline) {
			select {
			case <-c.quit:
				c.setFanTest(func(s *FanTestState) { s.Status, s.Message = "aborted", "contrôleur arrêté" })
				return
			case <-time.After(time.Second):
			}
			if temp := c.cachedTemp(); temp >= fanTestAbortTempC {
				c.setFanTest(func(s *FanTestState) {
					s.Status, s.Message = "aborted", "test interrompu : le processeur a atteint la température limite"
				})
				return
			}
		}
		_, rpm1 := c.cachedTempRPM()
		step := FanTestStep{Percent: int(percent), RPM1: int(rpm1)}
		if hasFan2 {
			if rpm2, ok := c.Fan2(); ok {
				step.RPM2 = int(rpm2)
			}
		}
		c.setFanTest(func(s *FanTestState) { s.Steps = append(s.Steps, step) })
	}

	c.setFanTest(func(s *FanTestState) {
		s.Status = "done"
		s.Verdict1 = judgeFan(s.Steps, func(st FanTestStep) int { return st.RPM1 })
		if hasFan2 {
			s.Verdict2 = judgeFan(s.Steps, func(st FanTestStep) int { return st.RPM2 })
		}
	})
}

// judgeFan juge un ventilateur d'après ses RPM aux trois paliers.
func judgeFan(steps []FanTestStep, rpm func(FanTestStep) int) string {
	if len(steps) < 3 {
		return ""
	}
	lo, mid, hi := rpm(steps[0]), rpm(steps[1]), rpm(steps[2])
	switch {
	case hi < 300:
		return "dead"
	case float64(hi) < float64(lo)*1.05:
		return "stuck" // la vitesse ne bouge pas avec la consigne : ventilateur gardé par le firmware, ou capteur figé
	case float64(mid) > float64(lo)*1.15 && float64(hi) > float64(mid)*1.05 && lo >= 1000:
		return "ok"
	}
	return "weak"
}
