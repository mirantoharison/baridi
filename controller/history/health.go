package history

import (
	"bufio"
	"encoding/json"
	"os"
	"sort"
	"sync"
	"time"
)

// HealthPoint est le relevé de santé de la batterie d'un jour : l'usure évolue en semaines, pas en minutes, d'où un
// seul point par jour (le dernier de la journée l'emporte).
type HealthPoint struct {
	// Date au format AAAA-MM-JJ (jour local).
	Date string `json:"date"`
	// WearPercent : part de capacité perdue depuis l'origine ; FullChargedMWh : capacité actuelle à pleine charge.
	WearPercent    float64 `json:"wear_percent"`
	FullChargedMWh int     `json:"full_charged_mwh"`
	// Cycles : cycles de charge complets (0 = le pilote ne le dit pas).
	Cycles int `json:"cycles,omitempty"`
}

// HealthStore garde un point par jour, sans limite de durée (une ligne par jour : quelques Ko par an).
type HealthStore struct {
	mu     sync.Mutex
	path   string
	points []HealthPoint
}

// OpenHealth charge le fichier (absent = vide). Une ligne coupée est ignorée.
func OpenHealth(path string) *HealthStore {
	h := &HealthStore{path: path}
	if f, err := os.Open(path); err == nil {
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			var p HealthPoint
			if json.Unmarshal(sc.Bytes(), &p) == nil && p.Date != "" {
				h.upsert(p)
			}
		}
	}
	return h
}

// upsert remplace le point du même jour ou l'ajoute ; garde la liste triée par date.
func (h *HealthStore) upsert(p HealthPoint) {
	for i := range h.points {
		if h.points[i].Date == p.Date {
			h.points[i] = p
			return
		}
	}
	h.points = append(h.points, p)
	sort.Slice(h.points, func(i, j int) bool { return h.points[i].Date < h.points[j].Date })
}

// Record enregistre le relevé du jour et réécrit le fichier (une ligne par jour : la réécriture est négligeable et évite
// les doublons après un redémarrage). Un relevé sans capacité (pilote muet) est ignoré.
func (h *HealthStore) Record(wear float64, fullMWh, cycles int) error {
	if fullMWh <= 0 {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.upsert(HealthPoint{Date: time.Now().Format("2006-01-02"), WearPercent: wear, FullChargedMWh: fullMWh, Cycles: cycles})
	tmp := h.path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	for _, p := range h.points {
		if err := enc.Encode(p); err != nil {
			f.Close()
			return err
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, h.path)
}

// Points renvoie une copie des relevés, du plus ancien au plus récent (jamais nil : l'interface attend un tableau).
func (h *HealthStore) Points() []HealthPoint {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]HealthPoint{}, h.points...)
}

// Run relève la santé de la batterie au démarrage puis toutes les heures, jusqu'à la fermeture de `stop`.
// `read` renvoie ok=false sans batterie ou si le pilote refuse : rien n'est alors enregistré.
func (h *HealthStore) Run(stop <-chan struct{}, read func() (wear float64, fullMWh, cycles int, ok bool)) {
	record := func() {
		if wear, full, cycles, ok := read(); ok {
			_ = h.Record(wear, full, cycles)
		}
	}
	record()
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			record()
		}
	}
}
