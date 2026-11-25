package fan

import (
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

// Capteurs supplémentaires de la DLL ASUS : températures de la carte mère et autour de la GPU, puissance et tension du
// processeur.
//
// IMPORTANT :
//   - le désassemblage montre que ces fonctions ne prennent aucun paramètre, mais qu'elles renvoient 0 si le modèle de
//     portable n'est pas dans leur liste interne : un 0 signifie « non pris en charge », jamais « 0 °C » ;
//   - la puissance et la tension n'ont pas d'échelle documentée : elles sont exposées BRUTES, à étalonner contre une
//     mesure connue avant d'être converties en watts ou en volts ;
//   - chaque appel est lent (0,3 à 1 s) et sérialisé avec le pilotage des ventilateurs : on les lit dans une boucle à
//     part, rarement, et seulement tant que l'interface les demande (voir TouchExtras).

// ExtraSensors : dernières valeurs lues. 0 = non pris en charge par ce modèle.
type ExtraSensors struct {
	BoardLeftC  int `json:"board_left_c,omitempty"`
	BoardRightC int `json:"board_right_c,omitempty"`
	GPULeftC    int `json:"gpu_left_c,omitempty"`
	GPURightC   int `json:"gpu_right_c,omitempty"`
	GPUVramC    int `json:"gpu_vram_c,omitempty"`
	GPUVrmC     int `json:"gpu_vrm_c,omitempty"`
	UpCPUC      int `json:"up_cpu_c,omitempty"`
	// CPUPowerRaw et CPUVoltageRaw : valeurs brutes de la DLL, unité inconnue (voir ci-dessus).
	CPUPowerRaw   int `json:"cpu_power_raw,omitempty"`
	CPUVoltageRaw int `json:"cpu_voltage_raw,omitempty"`
	// PL1Raw et PL2Raw : limites de puissance longue et courte durée du processeur (DPTF), lecture seule, unité à confirmer.
	PL1Raw int `json:"pl1_raw,omitempty"`
	PL2Raw int `json:"pl2_raw,omitempty"`
	// BatteryCycles : cycles de charge lus dans le contrôleur embarqué (le pilote Windows ne les donne pas toujours).
	BatteryCycles int `json:"battery_cycles,omitempty"`
}

// Any indique qu'au moins un capteur a répondu : sinon l'interface n'affiche aucune carte « capteurs ».
func (e ExtraSensors) Any() bool { return e != ExtraSensors{} }

const (
	// extraInterval : période de lecture des capteurs supplémentaires. Lente exprès : leur température varie peu et
	// chaque lecture fait attendre le pilotage des ventilateurs.
	extraInterval = 10 * time.Second
	// extraWatchedFor : sans demande depuis ce délai, on cesse de les lire.
	extraWatchedFor = 30 * time.Second
	// extraCallGap : pause entre deux appels DLL d'un même lot, pour laisser passer les écritures PWM entre eux.
	extraCallGap = 150 * time.Millisecond
	// maxPlausibleTempC écarte les valeurs aberrantes d'un capteur.
	maxPlausibleTempC = 125
)

type extraState struct {
	mu        sync.Mutex
	lastTouch time.Time
	values    ExtraSensors

	boardL, boardR, gpuL, gpuR, vram, vrm, upCPU, power, voltage, pl1, pl2, cycles *windows.LazyProc
}

func newExtraState(dll *windows.LazyDLL) *extraState {
	return &extraState{
		boardL:  dll.NewProc("Thermal_Read_BoardTS0L_Temperature"),
		boardR:  dll.NewProc("Thermal_Read_BoardTS0R_Temperature"),
		gpuL:    dll.NewProc("Thermal_Read_GpuTS1L_Temperature"),
		gpuR:    dll.NewProc("Thermal_Read_GpuTS1R_Temperature"),
		vram:    dll.NewProc("Thermal_Read_GpuVram_Temperature"),
		vrm:     dll.NewProc("Thermal_Read_GpuVrm_Temperature"),
		upCPU:   dll.NewProc("Thermal_Read_UpCpu_Temperature"),
		power:   dll.NewProc("Thermal_Read_CpuPackagePower"),
		voltage: dll.NewProc("CPU_ReadCpuVoltage"),
		pl1:     dll.NewProc("Thermal_Read_CpuDptf_PowerLimit1"),
		pl2:     dll.NewProc("Thermal_Read_CpuDptf_PowerLimit2"),
		cycles:  dll.NewProc("Battery_Read_CycleCount"),
	}
}

// TouchExtras signale que quelqu'un regarde les capteurs supplémentaires (voir extraWatchedFor).
func (c *Controller) TouchExtras() {
	c.extra.mu.Lock()
	c.extra.lastTouch = time.Now()
	c.extra.mu.Unlock()
}

// Extra renvoie les dernières valeurs lues des capteurs supplémentaires.
func (c *Controller) Extra() ExtraSensors {
	c.extra.mu.Lock()
	defer c.extra.mu.Unlock()
	return c.extra.values
}

// readExtraTemp lit un capteur de température sans paramètre ; 0 si non pris en charge ou aberrant.
func (c *Controller) readExtraTemp(name string, proc *windows.LazyProc) int {
	v := int(CallProc(name, proc))
	if v <= 0 || v > maxPlausibleTempC {
		return 0
	}
	return v
}

// runExtraPoll lit les capteurs supplémentaires tant que quelqu'un les demande. Elle s'arrête avec c.quit.
func (c *Controller) runExtraPoll() {
	for {
		select {
		case <-c.quit:
			return
		case <-time.After(extraInterval):
		}

		c.extra.mu.Lock()
		watched := time.Since(c.extra.lastTouch) <= extraWatchedFor
		c.extra.mu.Unlock()
		if !watched {
			continue
		}

		e := c.extra
		var v ExtraSensors
		pause := func() bool {
			select {
			case <-c.quit:
				return false
			case <-time.After(extraCallGap):
				return true
			}
		}
		v.BoardLeftC = c.readExtraTemp("BoardTS0L", e.boardL)
		if !pause() {
			return
		}
		v.BoardRightC = c.readExtraTemp("BoardTS0R", e.boardR)
		if !pause() {
			return
		}
		v.GPULeftC = c.readExtraTemp("GpuTS1L", e.gpuL)
		if !pause() {
			return
		}
		v.GPURightC = c.readExtraTemp("GpuTS1R", e.gpuR)
		if !pause() {
			return
		}
		v.GPUVramC = c.readExtraTemp("GpuVram", e.vram)
		if !pause() {
			return
		}
		v.GPUVrmC = c.readExtraTemp("GpuVrm", e.vrm)
		if !pause() {
			return
		}
		v.UpCPUC = c.readExtraTemp("UpCpu", e.upCPU)
		if !pause() {
			return
		}
		v.CPUPowerRaw = int(CallProc("CpuPackagePower", e.power))
		if !pause() {
			return
		}
		v.CPUVoltageRaw = int(CallProc("CpuVoltage", e.voltage))
		if !pause() {
			return
		}
		v.PL1Raw = plausibleLimit(int(CallProc("PowerLimit1", e.pl1)))
		if !pause() {
			return
		}
		v.PL2Raw = plausibleLimit(int(CallProc("PowerLimit2", e.pl2)))
		if !pause() {
			return
		}
		if n := int(CallProc("BatteryCycles", e.cycles)); n > 0 && n < 10000 {
			v.BatteryCycles = n
		}

		e.mu.Lock()
		e.values = v
		e.mu.Unlock()
	}
}

// plausibleLimit écarte une limite de puissance absurde : sur le matériel de développement, PL2 renvoie ~1,5 milliard,
// qui n'est ni des watts ni des milliwatts. Afficher un tel nombre serait pire que ne rien afficher.
func plausibleLimit(v int) int {
	const maxPlausible = 1_000_000
	if v < 0 || v > maxPlausible {
		return 0
	}
	return v
}
