package history

import "time"

// Summary est le résumé des dernières 24 heures.
type Summary struct {
	// Samples : nombre de mesures prises en compte ; 0 = historique vide sur la période.
	Samples int `json:"samples"`
	// CoveredHours : durée réellement couverte (le contrôleur a pu démarrer il y a peu).
	CoveredHours float64 `json:"covered_hours"`
	AvgTempC     float64 `json:"avg_temp_c"`
	MaxTempC     int     `json:"max_temp_c"`
	// MinutesAbove70 : temps passé à 70 °C ou plus (processeur).
	MinutesAbove70 int `json:"minutes_above_70"`
	// MinutesHighLoad : temps où le processeur dépassait 80 % de charge. Mesuré seulement quand l'interface était ouverte.
	MinutesHighLoad int `json:"minutes_high_load"`
	// MaxGPUTempC : température maximale de la carte (0 = jamais mesurée).
	MaxGPUTempC int `json:"max_gpu_temp_c"`
	// BatteryUsedWh et BatteryChargedWh : énergie tirée de la batterie, et énergie qui y est entrée, sur la période.
	BatteryUsedWh    float64 `json:"battery_used_wh"`
	BatteryChargedWh float64 `json:"battery_charged_wh"`
	// MinutesOnBattery : temps passé sur batterie.
	MinutesOnBattery int `json:"minutes_on_battery"`
	// Limitations sur la période : minutes cumulées et nombre d'épisodes (une suite de mesures consécutives en limitation).
	ThrottleCPUMinutes  int `json:"throttle_cpu_minutes"`
	ThrottleCPUEpisodes int `json:"throttle_cpu_episodes"`
	ThrottleGPUMinutes  int `json:"throttle_gpu_minutes"`
	ThrottleGPUEpisodes int `json:"throttle_gpu_episodes"`
}

// Summarize résume les dernières 24 heures. Chaque mesure représente une période d'Interval.
func (s *Store) Summarize() Summary {
	s.mu.Lock()
	cutoff := time.Now().Add(-24 * time.Hour).Unix()
	var part []Sample
	for i := len(s.samples) - 1; i >= 0 && s.samples[i].T >= cutoff; i-- {
		part = append(part, s.samples[i])
	}
	s.mu.Unlock()

	var out Summary
	if len(part) == 0 {
		return out
	}
	step := Interval.Seconds()
	var cpuRun, gpuRun bool // un épisode se termine à la première mesure sans limitation
	var tempSum float64
	var tempN int
	// part est du plus récent au plus ancien : on le parcourt tel quel, un épisode est une suite continue de mesures.
	for _, smp := range part {
		out.Samples++
		if smp.Temp > 0 {
			tempSum += float64(smp.Temp)
			tempN++
			if smp.Temp > out.MaxTempC {
				out.MaxTempC = smp.Temp
			}
			if smp.Temp >= 70 {
				out.MinutesAbove70 += int(step)
			}
		}
		if smp.CPUUsage > 80 {
			out.MinutesHighLoad += int(step)
		}
		if smp.ThrCPU {
			out.ThrottleCPUMinutes += int(step)
			if !cpuRun {
				out.ThrottleCPUEpisodes++
			}
		}
		cpuRun = smp.ThrCPU
		if smp.ThrGPU {
			out.ThrottleGPUMinutes += int(step)
			if !gpuRun {
				out.ThrottleGPUEpisodes++
			}
		}
		gpuRun = smp.ThrGPU
		if smp.GPUTemp > out.MaxGPUTempC {
			out.MaxGPUTempC = smp.GPUTemp
		}
		if !smp.Plugged && smp.Battery > 0 {
			out.MinutesOnBattery += int(step)
		}
		// Énergie = puissance × durée ; step en secondes, 3600 s par heure.
		if smp.BatPower < 0 {
			out.BatteryUsedWh += -smp.BatPower * step / 3600
		} else if smp.BatPower > 0 {
			out.BatteryChargedWh += smp.BatPower * step / 3600
		}
	}
	if tempN > 0 {
		out.AvgTempC = tempSum / float64(tempN)
	}
	// Les durées sont comptées en secondes puis ramenées en minutes.
	out.MinutesAbove70 /= 60
	out.MinutesHighLoad /= 60
	out.MinutesOnBattery /= 60
	out.ThrottleCPUMinutes /= 60
	out.ThrottleGPUMinutes /= 60
	out.CoveredHours = float64(part[0].T-part[len(part)-1].T) / 3600
	return out
}
