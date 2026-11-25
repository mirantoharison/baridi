package fan

import "time"

// Sonde unique des capteurs (température, RPM du ventilateur 1 et du ventilateur 2).
//
// IMPORTANT : sur le matériel de développement, chaque appel à la DLL ASUS dure 0,3 s seul mais 1 à 2 s dès
// que plusieurs fils d'exécution l'appellent (la DLL les traite l'un après l'autre). Avant cette sonde,
// chaque connexion de l'interface (1 Hz), la boucle Auto et la sonde du second ventilateur lisaient chacune
// la DLL : /status mettait 2 à 4 s. Désormais UN seul fil lit les capteurs, et tout le reste lit le cache.

// sensorPollInterval : période de la sonde. La température d'un processeur évolue lentement : 2 s suffisent,
// et c'est aussi la période de la boucle Auto.
const sensorPollInterval = 2 * time.Second

// StartSensorPoll lance la sonde de fond. Elle s'arrête quand Cleanup ferme c.quit.
func (c *Controller) StartSensorPoll() {
	// Capteurs supplémentaires : boucle à part, plus lente et à la demande (voir extra.go).
	go c.runExtraPoll()
	go func() {
		for {
			c.pollSensorsOnce()
			select {
			case <-c.quit:
				return
			case <-time.After(sensorPollInterval):
			}
		}
	}()
}

// pollSensorsOnce lit les capteurs dans la DLL et met le cache à jour. Le second ventilateur n'est lu que si la
// DLL en annonce au moins deux (voir fan2.go).
func (c *Controller) pollSensorsOnce() {
	temp := CallProc("ReadCpuTemp", c.ReadTemp)
	rpm, rpm2 := c.readRPMs()

	c.mu.Lock()
	c.sensTemp, c.sensRPM, c.sensReady = temp, rpm, true
	if c.fanCount >= 2 {
		c.fan2RPM, c.fan2Probed = rpm2, true
	}
	c.mu.Unlock()

	c.stats.record(temp, rpm, sensorPollInterval)

	// Hors du verrou : SetFan2 prend c.dll puis c.mu.
	c.enforceFan2Safety(temp)
	c.refreshFan2()
}

// fanSwitchSettle : délai laissé au contrôleur embarqué après un changement d'index de ventilateur, avant de lire ou
// d'écrire. Un essai a montré qu'une lecture faite juste après le retour à l'index 0 pouvait encore renvoyer le
// ventilateur 2 (5673 RPM contre 2347 pour le premier à la même seconde).
const fanSwitchSettle = 150 * time.Millisecond

// readRPMs lit la vitesse des deux ventilateurs.
//
// IMPORTANT : HealthyTable_FanRPM ne prend AUCUN paramètre. Son désassemblage montre que le registre du premier
// argument est écrasé avant toute lecture : elle renvoie la vitesse du ventilateur SÉLECTIONNÉ dans le contrôleur
// embarqué par HealthyTable_SetFanIndex. Les versions précédentes passaient l'index en argument et lisaient donc
// le ventilateur 1 deux fois — d'où deux RPM toujours identiques. Pour lire le 2e : sélectionner l'index 1, lire,
// revenir à 0, le tout sous c.dll pour qu'aucune écriture PWM ne s'intercale sur le mauvais ventilateur.
func (c *Controller) readRPMs() (rpm1, rpm2 uintptr) {
	c.dll.Lock()
	defer c.dll.Unlock()
	rpm1 = CallProc("ReadFanRPM", c.ReadRPM)
	if c.fanCount < 2 {
		return rpm1, 0
	}
	CallProc("SetFanIndex", c.SetFanIndex, fan2Index)
	time.Sleep(fanSwitchSettle)
	rpm2 = CallProc("ReadFanRPM", c.ReadRPM)
	CallProc("SetFanIndex", c.SetFanIndex, 0)
	time.Sleep(fanSwitchSettle)
	if rpm2 > maxPlausibleRPM {
		rpm2 = 0
	}
	return rpm1, rpm2
}

// cachedTempRPM renvoie les dernières mesures de la sonde. Avant la première lecture (démarrage), il en fait
// une lui-même : /status ne doit jamais renvoyer un 0 °C trompeur.
func (c *Controller) cachedTempRPM() (temp, rpm uintptr) {
	c.mu.Lock()
	ready := c.sensReady
	c.mu.Unlock()
	if !ready {
		c.pollSensorsOnce()
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.sensTemp, c.sensRPM
}

// cachedTemp renvoie la dernière température de la sonde.
func (c *Controller) cachedTemp() uintptr {
	temp, _ := c.cachedTempRPM()
	return temp
}
