package fan

import (
	"fmt"
	"log"
	"time"

	"golang.org/x/sys/windows"
)

// Second ventilateur (celui du GPU sur un portable ASUS à deux ventilateurs).
//
// IMPORTANT — ce que l'analyse de la DLL (désassemblage) et les essais sur la machine de développement ont établi :
//   - le nombre de ventilateurs vient de HealthyTable_FanCounts, pas d'une devinette ;
//   - HealthyTable_FanRPM ne prend AUCUN paramètre : elle lit le ventilateur SÉLECTIONNÉ dans le contrôleur embarqué
//     par HealthyTable_SetFanIndex. Lire le 2e = sélectionner l'index 1, lire, revenir à 0 (voir sensors.go). Passer
//     l'index en argument, comme le faisaient les premières versions, lisait le ventilateur 1 deux fois ;
//   - les commandes envoyées au contrôleur embarqué n'ont pas d'index de ventilateur (0x32 = index, 0x31 = mode test,
//     0x35 = puissance) : il faut sélectionner l'index, attendre fanSwitchSettle, écrire, puis revenir à 0 ;
//   - le ventilateur 2 est bien commandable : 90 % demandé = 5704 RPM, tenu 30 s pendant que le ventilateur 1 suivait
//     sa courbe. Une écriture n'est pas gardée sans le mode test activé sur l'index 1.
//
// Limite connue : le mode test se comporte comme GLOBAL. Couper le mode test pour rendre le ventilateur 2 au firmware
// (mode « firmware » après « suivre » ou « manuel ») rend AUSSI le ventilateur 1 au firmware : sa courbe est ignorée
// (0 RPM relevé pour 41 % demandé). C'est signalé par biosOverride, exposé en bios_override, et l'interface avertit.
// Au démarrage, le mode « firmware » ne touche pas au ventilateur 1.
//
// Les lectures sont lentes (plusieurs centaines de ms par appel) : jamais dans le chemin de /status, mais dans la
// sonde de fond (sensors.go) dont le résultat est mis en cache.

// unknownFanCount : la DLL n'a pas pu dire combien il y a de ventilateurs (fonction absente ou valeur absurde).
const unknownFanCount = -1

const (
	// maxPlausibleFanCount : au-delà, la valeur renvoyée n'est pas un nombre de ventilateurs.
	maxPlausibleFanCount = 8
	// fan2Index : index du second ventilateur dans la DLL ASUS.
	fan2Index = 1
	// maxPlausibleRPM écarte les valeurs aberrantes qu'une DLL peut renvoyer.
	maxPlausibleRPM = 20000
)

// readFanCount demande à la DLL le nombre de ventilateurs. Lecture seule, un seul appel au démarrage.
// Renvoie unknownFanCount si la fonction n'existe pas dans cette version de la DLL ou si la valeur est absurde.
func readFanCount(proc *windows.LazyProc) int {
	if err := proc.Find(); err != nil {
		log.Printf("fan: HealthyTable_FanCounts absent de la DLL (%v) : second ventilateur non géré", err)
		return unknownFanCount
	}
	raw := CallProc("HealthyTable_FanCounts", proc)
	if raw > maxPlausibleFanCount {
		log.Printf("fan: HealthyTable_FanCounts a renvoyé %d, valeur ignorée", raw)
		return unknownFanCount
	}
	log.Printf("fan: la DLL annonce %d ventilateur(s)", raw)
	return int(raw)
}

// FanCount renvoie le nombre de ventilateurs annoncé par la DLL au démarrage (unknownFanCount = inconnu).
func (c *Controller) FanCount() int { return c.fanCount }

// Modes de commande du second ventilateur.
const (
	// Fan2Firmware : le firmware le pilote (comportement d'origine, par défaut).
	Fan2Firmware = "firmware"
	// Fan2Follow : reçoit la même consigne que le ventilateur 1 (donc suit sa courbe).
	Fan2Follow = "follow"
	// Fan2Manual : reçoit une consigne fixe choisie par l'utilisateur.
	Fan2Manual = "manual"
	// Fan2Curve : suit sa propre courbe, sur la température du processeur, de la GPU ou la plus haute des deux.
	Fan2Curve = "curve"
)

const (
	// fan2MinManualPercent : en dessous, la consigne manuelle est refusée — un ventilateur quasi arrêté
	// pendant que le processeur chauffe est le scénario à éviter.
	fan2MinManualPercent = 20
	// fan2FollowStepPWM : en mode « suivre », le ventilateur 2 n'est réécrit que si la consigne a bougé d'au moins
	// ce pas (ou à l'arrivée sur la cible). Chaque écriture coûte plusieurs appels DLL lents : le faire à chaque
	// palier de 1 ou 2 points de PWM ralentirait toute la montée de vitesse.
	fan2FollowStepPWM = 10
	// fan2SafetyTempC : au-delà, un ventilateur 2 en mode manuel repasse automatiquement en « suivre ».
	fan2SafetyTempC = 85
)

// setPWM écrit la consigne PWM sur le ventilateur principal (index 0, sélectionné à l'init) et, en mode
// « suivre », sur le second. Toute la séquence est sous c.dll (voir son commentaire).
func (c *Controller) setPWM(pwm uintptr) {
	c.dll.Lock()
	defer c.dll.Unlock()
	CallProc("SetFanPwmDuty", c.SetFanPWM, pwm)

	c.mu.Lock()
	follow := c.fan2Mode == Fan2Follow
	target := c.targetPWM
	last := c.fan2PWM
	c.mu.Unlock()
	if !follow {
		return
	}
	moved := pwm > last && pwm-last >= fan2FollowStepPWM || last > pwm && last-pwm >= fan2FollowStepPWM
	if moved || pwm == target {
		c.writeFan2Locked(pwm)
	}
}

// writeFan2Locked écrit une consigne PWM sur le second ventilateur. c.dll doit être tenu.
//
// L'index 1 est sélectionné, le mode test y est activé la première fois (sans lui le firmware reprend la main
// en quelques secondes, constaté à l'essai), la consigne est écrite, puis on REVIENT à l'index 0 : tout le
// reste du code suppose l'index 0 sélectionné.
func (c *Controller) writeFan2Locked(pwm uintptr) {
	CallProc("SetFanIndex", c.SetFanIndex, fan2Index)
	time.Sleep(fanSwitchSettle) // le contrôleur embarqué doit avoir pris l'index avant d'y écrire
	enabledTestMode := !c.fan2TestOn
	if enabledTestMode {
		CallProc("SetFanTestMode", c.SetFanTestMode, 1)
		c.fan2TestOn = true
	}
	CallProc("SetFanPwmDuty", c.SetFanPWM, pwm)
	CallProc("SetFanIndex", c.SetFanIndex, 0)
	time.Sleep(fanSwitchSettle) // idem au retour : l'écriture suivante sur le ventilateur 1 ne doit pas partir sur le 2
	if enabledTestMode {
		c.rearmFan1Locked()
	}
	c.mu.Lock()
	c.fan2PWM = pwm
	c.biosOverride = false // le mode test est de nouveau actif : la courbe du ventilateur 1 s'applique
	c.mu.Unlock()
}

// rearmFan1Locked remet le ventilateur 1 sous le contrôle de l'application et lui réécrit sa consigne. c.dll doit
// être tenu, l'index 0 sélectionné.
//
// IMPORTANT : les commandes de la DLL n'embarquent pas d'index de ventilateur (opcode 0x31 pour le mode test, 0x35
// pour la puissance), et un essai a montré que couper le mode test « pour le ventilateur 2 » rendait AUSSI le
// ventilateur 1 au firmware : ses consignes étaient ignorées (5700 RPM pour 14 % demandé pendant ~15 s). Après chaque
// bascule du mode test, on le réarme donc et on réécrit la consigne du ventilateur 1 : la boucle Auto ne la
// renverrait sinon qu'au prochain changement de cible, et il resterait sans consigne entre-temps.
func (c *Controller) rearmFan1Locked() {
	CallProc("SetFanTestMode", c.SetFanTestMode, 1)
	c.mu.Lock()
	pwm := c.CurrentPWM
	c.mu.Unlock()
	if pwm > 0 {
		CallProc("SetFanPwmDuty", c.SetFanPWM, pwm)
	}
}

// releaseFan2Locked rend le second ventilateur au firmware (mode test coupé sur l'index 1). c.dll doit être tenu.
func (c *Controller) releaseFan2Locked() {
	c.mu.Lock()
	c.fan2Mode = Fan2Firmware
	c.mu.Unlock()
	if !c.fan2TestOn {
		return
	}
	CallProc("SetFanIndex", c.SetFanIndex, fan2Index)
	time.Sleep(fanSwitchSettle)
	CallProc("SetFanTestMode", c.SetFanTestMode, 0)
	CallProc("SetFanIndex", c.SetFanIndex, 0)
	time.Sleep(fanSwitchSettle)
	c.fan2TestOn = false
	// Couper le mode test a aussi libéré le ventilateur 1 : on tente de le reprendre tout de suite (voir rearmFan1Locked),
	// mais un essai a montré que cela ne suffit pas (ventilateur 1 resté à 0 RPM pendant tout le retour au firmware).
	c.rearmFan1Locked()
	c.mu.Lock()
	c.biosOverride = true
	c.mu.Unlock()
}

// BIOSOverride indique que le firmware pilote les deux ventilateurs (courbe du profil ignorée).
func (c *Controller) BIOSOverride() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.biosOverride
}

// SetFan2 choisit comment le second ventilateur est piloté. `percent` ne sert qu'en mode manuel.
func (c *Controller) SetFan2(mode string, percent uintptr) error {
	if c.fanCount < 2 {
		return fmt.Errorf("la DLL n'annonce pas deux ventilateurs (fan_count=%d)", c.fanCount)
	}
	switch mode {
	case Fan2Firmware, Fan2Follow:
	case Fan2Curve:
		if len(c.Fan2CurveState().Points) == 0 {
			return fmt.Errorf("define the curve first (POST /fan/fan2 with curve and source)")
		}
	case Fan2Manual:
		if percent > 100 {
			return fmt.Errorf("percent must be <= 100")
		}
		if percent < fan2MinManualPercent {
			return fmt.Errorf("manual speed must be at least %d%% (fan 2 almost stopped is unsafe)", fan2MinManualPercent)
		}
	default:
		return fmt.Errorf("unknown fan2 mode %q", mode)
	}

	c.dll.Lock()
	defer c.dll.Unlock()
	if mode == Fan2Firmware {
		c.releaseFan2Locked()
		return nil
	}
	c.mu.Lock()
	c.fan2Mode = mode
	c.fan2Percent = percent
	current, target := c.CurrentPWM, c.targetPWM
	c.mu.Unlock()
	if mode == Fan2Manual {
		c.writeFan2Locked(PercentToPWM(percent))
		return nil
	}
	if mode == Fan2Curve {
		c.writeFan2Locked(c.fan2CurvePWM(c.cachedTemp()))
		return nil
	}
	// Mode « suivre » : on prend le plus HAUT de la consigne actuelle et de la cible, jamais l'un des deux seul.
	// Au démarrage CurrentPWM vaut 0 (la montée n'a pas commencé) : écrire 0 arrêterait le ventilateur 2. Tant que
	// les deux sont nuls on n'écrit rien — le premier palier de montée (setPWM) s'en chargera.
	pwm := current
	if target > pwm {
		pwm = target
	}
	if pwm > 0 {
		c.writeFan2Locked(pwm)
	}
	return nil
}

// Fan2Control renvoie le mode courant du second ventilateur et sa consigne manuelle (en %).
func (c *Controller) Fan2Control() (mode string, percent uintptr) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.fan2Mode, c.fan2Percent
}

// refreshFan2 renvoie la consigne au second ventilateur, appelée à chaque cycle de la sonde (toutes les 2 s).
//
// Essai : une écriture unique n'est pas conservée par ce matériel — le ventilateur 2 retombait à la vitesse du
// firmware en quelques secondes alors que le ventilateur 1 tient une consigne écrite une seule fois. On vérifie si
// un renvoi régulier le fait tenir. Coût : 3 à 4 appels DLL par cycle, d'où le test avant de le garder.
func (c *Controller) refreshFan2() {
	c.mu.Lock()
	mode := c.fan2Mode
	c.mu.Unlock()
	if mode == Fan2Firmware || c.fanCount < 2 {
		return
	}

	c.dll.Lock()
	defer c.dll.Unlock()
	// Le mode a pu changer pendant l'attente du verrou (retour au firmware demandé entre-temps).
	c.mu.Lock()
	mode, percent, current, target := c.fan2Mode, c.fan2Percent, c.CurrentPWM, c.targetPWM
	c.mu.Unlock()
	switch mode {
	case Fan2Manual:
		c.writeFan2Locked(PercentToPWM(percent))
	case Fan2Curve:
		c.writeFan2Locked(c.fan2CurvePWM(c.cachedTemp()))
	case Fan2Follow:
		// Même règle que SetFan2 : le plus haut de la consigne actuelle et de la cible, jamais 0.
		pwm := current
		if target > pwm {
			pwm = target
		}
		if pwm > 0 {
			c.writeFan2Locked(pwm)
		}
	}
}

// enforceFan2Safety repasse le second ventilateur en mode « suivre » si le processeur est trop chaud pendant
// qu'il est en consigne manuelle : le ventilateur 1 suit la courbe, le 2 ne doit pas rester en retrait.
func (c *Controller) enforceFan2Safety(temp uintptr) {
	c.mu.Lock()
	manual := c.fan2Mode == Fan2Manual || c.fan2Mode == Fan2Curve
	c.mu.Unlock()
	if manual && temp >= fan2SafetyTempC {
		log.Printf("fan: %d°C : ventilateur 2 repassé en mode « suivre » par sécurité", temp)
		_ = c.SetFan2(Fan2Follow, 0)
	}
}

// Fan2 renvoie la dernière vitesse relevée du second ventilateur et si elle est disponible (deux ventilateurs
// annoncés par la DLL ET au moins une lecture faite par la sonde, voir sensors.go). Aucun appel à la DLL : lecture d'un cache.
func (c *Controller) Fan2() (rpm uintptr, available bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.fan2RPM, c.fan2Probed
}
