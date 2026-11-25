package history

import "time"

// Détection d'encrassement : à consigne égale, un ventilateur qui tourne de moins en moins vite signale de la poussière
// (dans les ailettes ou sur l'hélice) ou un roulement qui fatigue. On compare donc, par tranche de consigne, la vitesse
// moyenne des premiers jours à celle des derniers.

const (
	// minFoulingSpan : durée minimale couverte par l'historique avant de se prononcer.
	minFoulingSpan = 3 * 24 * time.Hour
	// minBucketSamples : mesures minimales par tranche et par période (environ 30 minutes), sinon la moyenne ne vaut rien.
	minBucketSamples = 60
	// foulingWatchPercent et foulingCleanPercent : baisse de vitesse à partir de laquelle on conseille de surveiller, puis de nettoyer.
	foulingWatchPercent = 8.0
	foulingCleanPercent = 15.0
)

// Fouling est le diagnostic d'encrassement.
type Fouling struct {
	// Status : « insufficient » (pas assez de recul), « ok », « watch » (à surveiller) ou « clean » (nettoyage conseillé).
	Status string `json:"status"`
	// DaysCovered : durée couverte par l'historique, en jours.
	DaysCovered float64 `json:"days_covered"`
	// DropPercent : baisse moyenne de la vitesse à consigne égale, en % (négative = le ventilateur tourne plus vite).
	DropPercent float64 `json:"drop_percent"`
	// Buckets : nombre de tranches de consigne comparables ; plus il y en a, plus le diagnostic est fiable.
	Buckets int `json:"buckets"`
}

// AnalyzeFouling compare le quart le plus ancien de l'historique au quart le plus récent, tranche de consigne par tranche.
func (s *Store) AnalyzeFouling() Fouling {
	s.mu.Lock()
	samples := append([]Sample(nil), s.samples...)
	s.mu.Unlock()

	out := Fouling{Status: "insufficient"}
	if len(samples) < 2 {
		return out
	}
	first, last := samples[0].T, samples[len(samples)-1].T
	span := time.Duration(last-first) * time.Second
	out.DaysCovered = span.Hours() / 24
	if span < minFoulingSpan {
		return out
	}

	quarter := (last - first) / 4
	// Tranches de consigne de 10 points entre 30 % et 69 % : en dessous le ventilateur est trop lent pour être mesuré
	// finement, au-dessus il sature souvent et le bruit de mesure masque la dérive.
	type acc struct {
		sum float64
		n   int
	}
	var old, recent [4]acc
	for _, smp := range samples {
		if smp.RPM <= 0 || smp.Percent < 30 || smp.Percent >= 70 {
			continue
		}
		b := (smp.Percent - 30) / 10
		switch {
		case smp.T <= first+quarter:
			old[b].sum += float64(smp.RPM)
			old[b].n++
		case smp.T >= last-quarter:
			recent[b].sum += float64(smp.RPM)
			recent[b].n++
		}
	}
	var drops float64
	for b := range old {
		if old[b].n < minBucketSamples || recent[b].n < minBucketSamples {
			continue
		}
		base, now := old[b].sum/float64(old[b].n), recent[b].sum/float64(recent[b].n)
		drops += 100 * (base - now) / base
		out.Buckets++
	}
	if out.Buckets == 0 {
		return out // pas de tranche assez fournie des deux côtés : on ne devine pas
	}
	out.DropPercent = drops / float64(out.Buckets)
	switch {
	case out.DropPercent >= foulingCleanPercent:
		out.Status = "clean"
	case out.DropPercent >= foulingWatchPercent:
		out.Status = "watch"
	default:
		out.Status = "ok"
	}
	return out
}
