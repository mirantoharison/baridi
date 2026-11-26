package fan

import "encoding/json"
import "os"

// CurvePoint représente un seuil de température avec la vitesse associée
type CurvePoint struct {
	Temp  int `json:"temp"`  // en °C
	Speed int `json:"speed"` // en %
}

type TransitionConfig struct {
	Step   int `json:"step"`    // pas PWM par tick (1-20)
	TickMs int `json:"tick_ms"` // délai entre chaque tick en ms
}

type Profile struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Icon        string           `json:"icon,omitempty"`
	Points      []CurvePoint     `json:"points"`
	Source      string           `json:"source"`
	Transition  TransitionConfig `json:"transition"`
}

// GetPWM calcule la valeur PWM pour une température donnée (mode step)
func (p Profile) GetPWM(temp int) uintptr {
	if len(p.Points) == 0 {
		return PercentToPWM(0)
	}
	for _, pt := range p.Points {
		if temp < pt.Temp {
			return PercentToPWM(uintptr(pt.Speed))
		}
	}
	return PercentToPWM(uintptr(p.Points[len(p.Points)-1].Speed))
}

// monotoneTangents calcule la pente de la courbe en chaque point (interpolation cubique monotone de Fritsch–Butland).
// IMPORTANT : une pente nulle là où la courbe change de sens (ou reste plate d'un côté) empêche tout dépassement : la
// vitesse ne descend jamais sous le point le plus bas ni ne monte au-dessus du plus haut entre deux points, ce qu'un
// spline cubique ordinaire ferait (jusqu'à demander plus de 100 % ou moins de 0 %).
func monotoneTangents(pts []CurvePoint) []float64 {
	n := len(pts)
	m := make([]float64, n)
	if n < 2 {
		return m
	}
	d := make([]float64, n-1) // pente de chaque segment
	h := make([]float64, n-1) // largeur de chaque segment, en degrés
	for k := 0; k < n-1; k++ {
		h[k] = float64(pts[k+1].Temp - pts[k].Temp)
		if h[k] > 0 {
			d[k] = float64(pts[k+1].Speed-pts[k].Speed) / h[k]
		}
	}
	m[0], m[n-1] = d[0], d[n-2]
	for k := 1; k < n-1; k++ {
		if d[k-1]*d[k] <= 0 {
			continue // extremum ou palier : pente nulle
		}
		w1, w2 := 2*h[k]+h[k-1], h[k]+2*h[k-1]
		m[k] = (w1 + w2) / (w1/d[k-1] + w2/d[k])
	}
	return m
}

// smoothSpeed renvoie la vitesse (en %) de la courbe lissée à une température donnée. Hors de l'étendue des points, on
// garde la vitesse du premier ou du dernier (sinon une température basse retomberait sur celle du dernier point).
func smoothSpeed(pts []CurvePoint, temp float64) float64 {
	n := len(pts)
	if n == 0 {
		return 0
	}
	if temp <= float64(pts[0].Temp) {
		return float64(pts[0].Speed)
	}
	if temp >= float64(pts[n-1].Temp) {
		return float64(pts[n-1].Speed)
	}
	m := monotoneTangents(pts)
	for i := 0; i < n-1; i++ {
		x0, x1 := float64(pts[i].Temp), float64(pts[i+1].Temp)
		if temp < x0 || temp > x1 || x1 <= x0 {
			continue
		}
		h := x1 - x0
		t := (temp - x0) / h
		t2, t3 := t*t, t*t*t
		y0, y1 := float64(pts[i].Speed), float64(pts[i+1].Speed)
		return (2*t3-3*t2+1)*y0 + (t3-2*t2+t)*h*m[i] + (-2*t3+3*t2)*y1 + (t3-t2)*h*m[i+1]
	}
	return float64(pts[n-1].Speed)
}

// GetPWMSmooth calcule la valeur PWM le long d'une courbe lissée (mode smooth) : interpolation cubique monotone entre
// les points, donc une courbe arrondie et sans dépassement. L'interface trace exactement la même courbe (curve-path.ts).
func (p Profile) GetPWMSmooth(temp int) uintptr {
	v := smoothSpeed(p.Points, float64(temp)) + 0.5
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	return PercentToPWM(uintptr(v))
}

// SystemProfiles remplace l'ancien map — profils non modifiables
var defaultTransition = TransitionConfig{Step: 5, TickMs: 50}
var SystemProfiles = []Profile{
	{
		ID:         "silent",
		Name:       "Silent",
		Icon:       "Moon",
		Source:     "system",
		Transition: defaultTransition,
		Points: []CurvePoint{
			{Temp: 50, Speed: 10},
			{Temp: 60, Speed: 20},
			{Temp: 70, Speed: 40},
			{Temp: 100, Speed: 60},
		},
	},
	{
		ID:         "balanced",
		Name:       "Balanced",
		Icon:       "Gauge",
		Source:     "system",
		Transition: defaultTransition,
		// IMPORTANT : une courbe vide donnerait 0 % de PWM en auto
		Points: []CurvePoint{
			{Temp: 35, Speed: 10},
			{Temp: 45, Speed: 30},
			{Temp: 55, Speed: 50},
			{Temp: 65, Speed: 70},
			{Temp: 75, Speed: 90},
			{Temp: 100, Speed: 100},
		},
	},
	{
		ID:     "turbo",
		Name:   "Turbo",
		Icon:   "Rocket",
		Source: "system",
		Points: []CurvePoint{
			{Temp: 40, Speed: 40},
			{Temp: 50, Speed: 60},
			{Temp: 60, Speed: 80},
			{Temp: 100, Speed: 100},
		},
	},
}

// LoadUserProfiles charge des profils depuis un fichier JSON
func LoadUserProfiles(path string) ([]Profile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var profiles []Profile
	return profiles, json.Unmarshal(data, &profiles)
}

// GetAllProfiles fusionne les profils système et utilisateur
func GetAllProfiles(userProfiles []Profile) []Profile {
	return append(SystemProfiles, userProfiles...)
}

func getSystemProfile(id string) Profile {
	for _, p := range SystemProfiles {
		if p.ID == id {
			return p
		}
	}
	return SystemProfiles[0] // fallback silent
}
