package fan

import (
	"sync"
	"time"
)

// Statistiques de session : calculées par le contrôleur, qui tourne en permanence (service compris), et non par
// l'interface, qui n'en verrait que la partie où elle est ouverte. Elles se remettent à zéro au redémarrage du contrôleur.

// SessionStats résume la température du processeur et le ventilateur depuis le démarrage du contrôleur.
type SessionStats struct {
	// UptimeS : durée depuis le démarrage du contrôleur, en secondes.
	UptimeS  int64   `json:"uptime_s"`
	Samples  int     `json:"samples"`
	MinTempC int     `json:"min_temp_c"`
	MaxTempC int     `json:"max_temp_c"`
	AvgTempC float64 `json:"avg_temp_c"`
	// SecondsAbove70/80/90 : temps passé au-dessus de chaque seuil, en secondes.
	SecondsAbove70 int `json:"seconds_above_70"`
	SecondsAbove80 int `json:"seconds_above_80"`
	SecondsAbove90 int `json:"seconds_above_90"`
	MaxRPM         int `json:"max_rpm"`
}

type sessionStats struct {
	mu      sync.Mutex
	started time.Time
	s       SessionStats
	sumTemp float64
}

func newSessionStats() *sessionStats { return &sessionStats{started: time.Now()} }

// record enregistre une mesure valable pour `span` (la période de la sonde). Une température à 0 est une lecture
// ratée du capteur : l'enregistrer fausserait le minimum et la moyenne.
func (st *sessionStats) record(temp, rpm uintptr, span time.Duration) {
	if temp == 0 {
		return
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	t := int(temp)
	secs := int(span.Seconds())
	if st.s.Samples == 0 || t < st.s.MinTempC {
		st.s.MinTempC = t
	}
	if t > st.s.MaxTempC {
		st.s.MaxTempC = t
	}
	st.s.Samples++
	st.sumTemp += float64(t)
	if t >= 70 {
		st.s.SecondsAbove70 += secs
	}
	if t >= 80 {
		st.s.SecondsAbove80 += secs
	}
	if t >= 90 {
		st.s.SecondsAbove90 += secs
	}
	if int(rpm) > st.s.MaxRPM {
		st.s.MaxRPM = int(rpm)
	}
}

// snapshot renvoie une copie des statistiques avec la durée et la moyenne à jour.
func (st *sessionStats) snapshot() SessionStats {
	st.mu.Lock()
	defer st.mu.Unlock()
	out := st.s
	out.UptimeS = int64(time.Since(st.started).Seconds())
	if out.Samples > 0 {
		out.AvgTempC = st.sumTemp / float64(out.Samples)
	}
	return out
}

// Stats renvoie les statistiques de session du contrôleur.
func (c *Controller) Stats() SessionStats { return c.stats.snapshot() }
