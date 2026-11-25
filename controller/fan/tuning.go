package fan

import "fmt"

// Réglages fins du pilotage automatique, globaux à tous les profils.
const (
	// SmoothingFast : changements de vitesse deux fois plus rapides (réactif, plus audible).
	SmoothingFast = "fast"
	// SmoothingNormal : pas de transition du profil, tel quel.
	SmoothingNormal = "normal"
	// SmoothingSlow : pas divisé par trois (montées et descentes très progressives).
	SmoothingSlow = "slow"

	// MaxHysteresisC borne l'hystérésis : au-delà, le ventilateur resterait trop longtemps
	// haut après un pic de température.
	MaxHysteresisC = 10
	// MaxTempFilterS borne la moyenne glissante : au-delà, une vraie montée en température
	// mettrait trop longtemps à être prise en compte.
	MaxTempFilterS = 20

	// autoPollSeconds : période de la boucle Auto (voir StartAuto) ; sert à convertir le filtre en nombre de mesures.
	autoPollSeconds = 2
	// filterBypassTempC : à partir de cette température brute, le filtre est ignoré. Un pic bref à 70° peut
	// être un bruit de mesure ; un relevé à 90° ou plus ne doit jamais être « lissé » vers le bas.
	filterBypassTempC = 90
)

// Tuning regroupe les réglages fins du mode Auto.
type Tuning struct {
	// HysteresisC : degrés de baisse requis avant de ralentir (0 = désactivée).
	HysteresisC int
	// Smoothing : "fast", "normal" ou "slow". Une chaîne vide vaut « normal » (settings.json antérieur à l'option).
	Smoothing string
	// TempFilterS : fenêtre de la moyenne glissante sur la température, en secondes (0 = désactivée).
	TempFilterS int
}

// SetTuning applique les réglages fins après validation.
func (c *Controller) SetTuning(t Tuning) error {
	if t.HysteresisC < 0 || t.HysteresisC > MaxHysteresisC {
		return fmt.Errorf("hysteresis must be between 0 and %d", MaxHysteresisC)
	}
	if t.TempFilterS < 0 || t.TempFilterS > MaxTempFilterS {
		return fmt.Errorf("temp filter must be between 0 and %d seconds", MaxTempFilterS)
	}
	switch t.Smoothing {
	case "":
		t.Smoothing = SmoothingNormal
	case SmoothingFast, SmoothingNormal, SmoothingSlow:
	default:
		return fmt.Errorf("unknown smoothing %q", t.Smoothing)
	}
	c.mu.Lock()
	c.HysteresisC = t.HysteresisC
	c.Smoothing = t.Smoothing
	c.TempFilterS = t.TempFilterS
	c.mu.Unlock()
	return nil
}

// scaleStep adapte le pas PWM d'une transition au lissage choisi (jamais en dessous de 1).
func scaleStep(step uintptr, smoothing string) uintptr {
	switch smoothing {
	case SmoothingFast:
		return step * 2
	case SmoothingSlow:
		if step/3 < 1 {
			return 1
		}
		return step / 3
	}
	return step
}

// filterTemp ajoute une mesure brute et renvoie la température à utiliser : la moyenne des dernières
// mesures sur la fenêtre demandée. `recent` est l'historique propre à la boucle Auto.
//
// IMPORTANT : au-dessus de filterBypassTempC on renvoie la mesure brute — le filtre sert à ignorer le
// bruit, pas à retarder la réaction face à une vraie surchauffe.
func filterTemp(recent *[]uintptr, raw uintptr, windowS int) uintptr {
	window := windowS / autoPollSeconds
	if window < 1 {
		window = 1
	}
	*recent = append(*recent, raw)
	if len(*recent) > window {
		*recent = (*recent)[len(*recent)-window:]
	}
	if window == 1 || raw >= filterBypassTempC {
		return raw
	}
	var sum uintptr
	for _, t := range *recent {
		sum += t
	}
	n := uintptr(len(*recent))
	return (sum + n/2) / n
}

// shouldApplyTarget décide si le pilotage automatique doit passer à la nouvelle cible.
//
// IMPORTANT : l'hystérésis ne retarde que les BAISSES de vitesse. Une montée est toujours appliquée
// tout de suite — retarder le refroidissement serait dangereux. Une baisse n'est appliquée qu'une fois
// la température redescendue de hysteresisC degrés sous celle du dernier changement (baselineTemp),
// ce qui évite un ventilateur qui « pompe » quand la température oscille autour d'un seuil.
// `forced` (changement de profil ou de mode de courbe) contourne l'hystérésis : l'utilisateur
// attend un effet immédiat, pas une attente que la machine refroidisse.
func shouldApplyTarget(target, current uintptr, temp, baselineTemp, hysteresisC int, forced bool) bool {
	if forced || hysteresisC <= 0 || target > current {
		return true
	}
	return temp <= baselineTemp-hysteresisC
}
