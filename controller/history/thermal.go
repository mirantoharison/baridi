package history

import "time"

// Profil thermique : combien de temps la machine passe à chaque température, et à quelle vitesse tourne alors le
// ventilateur. L'interface s'en sert pour proposer d'ajuster une courbe (trop chaud trop souvent, ou ventilateur
// bruyant alors que la machine est fraîche).

const (
	thermalBucketC = 5
	thermalMinC    = 30
	thermalMaxC    = 100
)

// ThermalBucket regroupe les mesures d'une tranche de 5 °C.
type ThermalBucket struct {
	// TempC : borne basse de la tranche (30 = de 30 à 34 °C ; la première tranche contient aussi tout ce qui est plus frais).
	TempC   int `json:"temp_c"`
	Samples int `json:"samples"`
	// AvgPercent : consigne moyenne du ventilateur 1 dans cette tranche ; AvgCPU : charge moyenne du processeur (0 si jamais mesurée).
	AvgPercent float64 `json:"avg_percent"`
	AvgCPU     float64 `json:"avg_cpu"`
}

// ThermalProfile est la répartition sur tout l'historique conservé.
type ThermalProfile struct {
	Samples     int             `json:"samples"`
	DaysCovered float64         `json:"days_covered"`
	Buckets     []ThermalBucket `json:"buckets"`
}

// ThermalProfile calcule la répartition des températures. Une mesure sans température (lecture ratée) est ignorée.
func (s *Store) ThermalProfile() ThermalProfile {
	s.mu.Lock()
	samples := append([]Sample(nil), s.samples...)
	s.mu.Unlock()

	n := (thermalMaxC-thermalMinC)/thermalBucketC + 1
	type acc struct {
		count, cpuCount int
		pct, cpu        float64
	}
	buckets := make([]acc, n)
	out := ThermalProfile{Buckets: []ThermalBucket{}}
	for _, smp := range samples {
		if smp.Temp <= 0 {
			continue
		}
		t := smp.Temp
		if t < thermalMinC {
			t = thermalMinC
		}
		if t > thermalMaxC {
			t = thermalMaxC
		}
		b := &buckets[(t-thermalMinC)/thermalBucketC]
		b.count++
		b.pct += float64(smp.Percent)
		if smp.CPUUsage > 0 {
			b.cpu += float64(smp.CPUUsage)
			b.cpuCount++
		}
		out.Samples++
	}
	if len(samples) > 1 {
		out.DaysCovered = (time.Duration(samples[len(samples)-1].T-samples[0].T) * time.Second).Hours() / 24
	}
	for i, b := range buckets {
		if b.count == 0 {
			continue
		}
		tb := ThermalBucket{TempC: thermalMinC + i*thermalBucketC, Samples: b.count, AvgPercent: b.pct / float64(b.count)}
		if b.cpuCount > 0 {
			tb.AvgCPU = b.cpu / float64(b.cpuCount)
		}
		out.Buckets = append(out.Buckets, tb)
	}
	return out
}
