package hw

import (
	"sync"
	"time"
)

const (
	// sampleInterval : période des mesures tant que quelqu'un regarde.
	sampleInterval = 2 * time.Second
	// idleAfter : sans demande de lecture depuis ce délai, on cesse de mesurer.
	//
	// IMPORTANT : sur un portable à carte graphique commutable (Optimus), interroger la GPU en continu peut l'empêcher de
	// se mettre en veille et coûter de la batterie. Personne ne regarde quand l'interface est fermée ou réduite : le
	// contrôleur, lui, tourne en permanence (service) et ne doit donc pas mesurer pour rien.
	idleAfter = 15 * time.Second
	// resumeGap : écart entre les deux relevés de reprise (la charge se calcule sur une différence).
	resumeGap = 500 * time.Millisecond
)

// Snapshot regroupe la dernière mesure du processeur et de la carte graphique.
type Snapshot struct {
	CPU CPU
	// GPU est nil sans carte NVIDIA (ou sans pilote) : il n'y a alors rien à afficher.
	GPU *GPU
	// RAM est nil si Windows refuse de la lire ; Battery.Present est faux sur une machine sans batterie.
	RAM     *RAM
	Battery Battery
}

// Monitor mesure le processeur et la GPU en arrière-plan et garde la dernière valeur en cache.
type Monitor struct {
	mu        sync.Mutex
	cpu       *cpuSampler
	gpu       *gpuSampler
	snap      Snapshot
	have      bool
	lastTouch time.Time
	// sampledAt : date de la dernière mesure complète ; gpuTemp/gpuTempAt : cache de GPUTemp.
	sampledAt time.Time
	gpuTemp   int
	gpuTempAt time.Time
}

// NewMonitor prépare les mesures (registre, compteurs de performance, NVML). Rien n'est mesuré avant Run ou Snapshot.
func NewMonitor() *Monitor {
	return &Monitor{cpu: newCPUSampler(), gpu: newGPUSampler()}
}

// sample prend une mesure complète et met le cache à jour. m.mu doit être tenu.
func (m *Monitor) sample() {
	m.snap.CPU = m.cpu.Sample()
	if m.gpu != nil {
		// IMPORTANT : on lit d'abord l'état d'alimentation de la carte (sans la déranger). Si elle dort, on ne l'interroge
		// PAS : NVML la réveillerait, et l'application la garderait allumée tant que la fenêtre est ouverte.
		state := GPUPowerState()
		var g GPU
		if state != "" && state != "D0" {
			g = GPU{Name: m.gpu.name, Driver: m.gpu.driver, PState: -1, Asleep: true}
		} else {
			g = m.gpu.Sample()
		}
		g.PowerState = state
		g.Mode = graphicsMode()
		m.snap.GPU = &g
	}
	if ram, ok := readRAM(); ok {
		m.snap.RAM = &ram
	}
	m.snap.Battery = readBattery()
	m.have = true
	m.sampledAt = time.Now()
}

// Snapshot renvoie la dernière mesure, et signale que quelqu'un regarde (voir idleAfter). La toute première demande
// mesure sur place : un état vide serait pris pour une machine à 0 % de charge.
func (m *Monitor) Snapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastTouch = time.Now()
	if !m.have {
		m.sample()
	}
	return m.snap
}

// Run mesure toutes les sampleInterval tant que Snapshot a été appelé récemment, jusqu'à la fermeture de stop.
func (m *Monitor) Run(stop <-chan struct{}) {
	idle := true
	for {
		select {
		case <-stop:
			return
		case <-time.After(sampleInterval):
		}

		m.mu.Lock()
		watched := time.Since(m.lastTouch) <= idleAfter
		m.mu.Unlock()

		if !watched {
			idle = true
			continue
		}
		if idle {
			// Reprise après une pause : la charge se calcule sur la différence de deux relevés, et le dernier date
			// d'avant la pause. On refait un point de départ, puis on mesure un instant plus tard.
			m.mu.Lock()
			m.cpu.Sample()
			m.mu.Unlock()
			select {
			case <-stop:
				return
			case <-time.After(resumeGap):
			}
			idle = false
		}
		m.mu.Lock()
		m.sample()
		m.mu.Unlock()
	}
}

// Latest renvoie la dernière mesure SANS signaler que quelqu'un regarde (contrairement à Snapshot), et dit si elle est
// assez récente pour être fiable. C'est ce qu'utilise l'historique : il ne doit pas maintenir les mesures éveillées.
func (m *Monitor) Latest() (Snapshot, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snap, m.have && time.Since(m.sampledAt) <= 2*idleAfter
}

// gpuTempCacheFor : durée de validité d'une température GPU lue par GPUTemp. Deux appelants (la boucle Auto et le
// second ventilateur) la demandent toutes les 2 s : une seule lecture NVML suffit.
const gpuTempCacheFor = 1500 * time.Millisecond

// GPUTemp renvoie la température de la carte graphique, ou 0 si elle est absente, endormie ou illisible. Une carte en
// veille profonde n'est JAMAIS interrogée (cela la réveillerait) : sa température vaut alors 0.
func (m *Monitor) GPUTemp() int {
	if m.gpu == nil {
		return 0
	}
	m.mu.Lock()
	if time.Since(m.gpuTempAt) < gpuTempCacheFor {
		t := m.gpuTemp
		m.mu.Unlock()
		return t
	}
	m.mu.Unlock()

	t := 0
	if state := GPUPowerState(); state == "" || state == "D0" {
		t = m.gpu.Temp()
	}
	m.mu.Lock()
	m.gpuTemp, m.gpuTempAt = t, time.Now()
	m.mu.Unlock()
	return t
}
