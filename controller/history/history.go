// Package history garde un historique long des mesures (températures, ventilateurs, charges, batterie), indépendant de
// l'interface : le contrôleur tourne en permanence (service), donc l'historique couvre aussi les périodes où la fenêtre est
// fermée. Il sert aux courbes sur plusieurs jours, à la consommation de la batterie et à la détection d'encrassement.
package history

import (
	"bufio"
	"encoding/json"
	"os"
	"sort"
	"sync"
	"time"
)

// Sample est une mesure. Un champ à 0 veut dire « non mesuré à cet instant » (par exemple la GPU quand personne ne
// regardait l'interface, ou quand elle dormait) : il est omis du fichier et ignoré dans les moyennes.
type Sample struct {
	// T : date en secondes Unix.
	T int64 `json:"t"`
	// Température du processeur (°C), consigne du ventilateur 1 (%), vitesses des deux ventilateurs (RPM).
	Temp    int `json:"temp,omitempty"`
	Percent int `json:"pct,omitempty"`
	RPM     int `json:"rpm,omitempty"`
	RPM2    int `json:"rpm2,omitempty"`
	// Charge du processeur, température, charge (%) et puissance (W) de la GPU.
	CPUUsage int     `json:"cpu,omitempty"`
	GPUTemp  int     `json:"gpu_t,omitempty"`
	GPUUsage int     `json:"gpu_u,omitempty"`
	GPUPower float64 `json:"gpu_w,omitempty"`
	// Batterie : niveau (%), puissance (W, négative en décharge) et branchement sur secteur.
	Battery  int     `json:"bat,omitempty"`
	BatPower float64 `json:"bat_w,omitempty"`
	Plugged  bool    `json:"ac,omitempty"`
}

const (
	// retention : durée de conservation. À une mesure toutes les 30 s, 14 jours font ~40 000 lignes (quelques Mo).
	retention = 14 * 24 * time.Hour
	// Interval : période d'enregistrement.
	Interval = 30 * time.Second
	// compactEvery : réécriture du fichier pour en retirer les lignes trop anciennes.
	compactEvery = 6 * time.Hour
)

// Store garde les mesures en mémoire et dans un fichier JSON lignes (une mesure par ligne, ajout seul : une coupure de
// courant ne corrompt au pire que la dernière ligne).
type Store struct {
	mu      sync.Mutex
	path    string
	samples []Sample
	file    *os.File
}

// Open charge le fichier (absent = historique vide) et écarte ce qui dépasse la durée de conservation.
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	cutoff := time.Now().Add(-retention).Unix()
	dropped := false
	if f, err := os.Open(path); err == nil {
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			var smp Sample
			if json.Unmarshal(sc.Bytes(), &smp) != nil {
				continue // ligne coupée : on l'ignore
			}
			if smp.T < cutoff {
				dropped = true
				continue
			}
			s.samples = append(s.samples, smp)
		}
		f.Close()
	}
	sort.Slice(s.samples, func(i, j int) bool { return s.samples[i].T < s.samples[j].T })
	if dropped {
		if err := s.rewriteLocked(); err != nil {
			return nil, err
		}
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	s.file = f
	return s, nil
}

// rewriteLocked réécrit le fichier avec les mesures en mémoire. s.mu doit être tenu (ou le magasin pas encore partagé).
func (s *Store) rewriteLocked() error {
	tmp := s.path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	for _, smp := range s.samples {
		b, _ := json.Marshal(smp)
		w.Write(b)
		w.WriteByte('\n')
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	f.Close()
	if s.file != nil {
		s.file.Close()
		s.file = nil
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return err
	}
	f2, err := os.OpenFile(s.path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	s.file = f2
	return nil
}

// Add enregistre une mesure.
func (s *Store) Add(smp Sample) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.samples = append(s.samples, smp)
	if s.file != nil {
		if b, err := json.Marshal(smp); err == nil {
			s.file.Write(append(b, '\n'))
		}
	}
}

// compact retire les mesures trop anciennes de la mémoire et du fichier.
func (s *Store) compact() {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-retention).Unix()
	i := sort.Search(len(s.samples), func(i int) bool { return s.samples[i].T >= cutoff })
	if i == 0 {
		return
	}
	s.samples = append([]Sample(nil), s.samples[i:]...)
	_ = s.rewriteLocked()
}

// Run enregistre collect() toutes les Interval jusqu'à la fermeture de stop, et compacte de temps en temps.
func (s *Store) Run(stop <-chan struct{}, collect func() Sample) {
	tick := time.NewTicker(Interval)
	defer tick.Stop()
	lastCompact := time.Now()
	for {
		select {
		case <-stop:
			s.mu.Lock()
			if s.file != nil {
				s.file.Close()
				s.file = nil
			}
			s.mu.Unlock()
			return
		case <-tick.C:
		}
		smp := collect()
		smp.T = time.Now().Unix()
		s.Add(smp)
		if time.Since(lastCompact) > compactEvery {
			s.compact()
			lastCompact = time.Now()
		}
	}
}

// bucket accumule les mesures d'un intervalle pour en faire la moyenne, champ par champ, sans compter les zéros.
type bucket struct {
	t       int64
	n       int
	sum     [10]float64
	cnt     [10]int
	plugged int
}

func (b *bucket) add(smp Sample) {
	vals := [10]float64{float64(smp.Temp), float64(smp.Percent), float64(smp.RPM), float64(smp.RPM2), float64(smp.CPUUsage),
		float64(smp.GPUTemp), float64(smp.GPUUsage), smp.GPUPower, float64(smp.Battery), smp.BatPower}
	for i, v := range vals {
		// Le niveau de batterie à 0 % est possible mais rare : on le traite comme les autres. Une puissance nulle
		// (batterie pleine, branchée) est une vraie mesure, mais l'omettre de la moyenne est sans conséquence.
		if v != 0 {
			b.sum[i] += v
			b.cnt[i]++
		}
	}
	if smp.Plugged {
		b.plugged++
	}
	b.n++
}

func (b *bucket) result() Sample {
	avg := func(i int) float64 {
		if b.cnt[i] == 0 {
			return 0
		}
		return b.sum[i] / float64(b.cnt[i])
	}
	return Sample{
		T: b.t, Temp: int(avg(0) + 0.5), Percent: int(avg(1) + 0.5), RPM: int(avg(2) + 0.5), RPM2: int(avg(3) + 0.5),
		CPUUsage: int(avg(4) + 0.5), GPUTemp: int(avg(5) + 0.5), GPUUsage: int(avg(6) + 0.5), GPUPower: avg(7),
		Battery: int(avg(8) + 0.5), BatPower: avg(9), Plugged: b.plugged*2 > b.n,
	}
}

// Query renvoie les mesures des `window` dernières, réduites à `maxPoints` points au plus par moyenne d'intervalles
// réguliers (l'interface ne dessine pas 40 000 points).
func (s *Store) Query(window time.Duration, maxPoints int) []Sample {
	if window > retention {
		window = retention
	}
	if maxPoints < 2 {
		maxPoints = 2
	}
	s.mu.Lock()
	cutoff := time.Now().Add(-window).Unix()
	i := sort.Search(len(s.samples), func(i int) bool { return s.samples[i].T >= cutoff })
	part := append([]Sample(nil), s.samples[i:]...)
	s.mu.Unlock()

	if len(part) <= maxPoints {
		return part
	}
	span := part[len(part)-1].T - part[0].T + 1
	step := span / int64(maxPoints)
	if step < 1 {
		step = 1
	}
	var out []Sample
	var cur *bucket
	for _, smp := range part {
		slot := part[0].T + (smp.T-part[0].T)/step*step
		if cur == nil || cur.t != slot {
			if cur != nil {
				out = append(out, cur.result())
			}
			cur = &bucket{t: slot}
		}
		cur.add(smp)
	}
	if cur != nil {
		out = append(out, cur.result())
	}
	return out
}

// Close ferme le fichier (les tests, qui suppriment leur dossier, en ont besoin ; le contrôleur ferme via Run).
func (s *Store) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file != nil {
		s.file.Close()
		s.file = nil
	}
}

// AvgDischargeW renvoie la puissance moyenne de décharge (en watts, positive) sur la fenêtre donnée, d'après les mesures
// faites sur batterie. false s'il y en a trop peu (batterie branchée depuis longtemps, historique neuf) : une moyenne sur
// quelques points ne vaut pas mieux que la valeur instantanée.
func (s *Store) AvgDischargeW(window time.Duration) (float64, bool) {
	const minSamples = 6
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-window).Unix()
	var sum float64
	n := 0
	for i := len(s.samples) - 1; i >= 0 && s.samples[i].T >= cutoff; i-- {
		smp := s.samples[i]
		if !smp.Plugged && smp.BatPower < 0 {
			sum += -smp.BatPower
			n++
		}
	}
	if n < minSamples {
		return 0, false
	}
	return sum / float64(n), true
}
