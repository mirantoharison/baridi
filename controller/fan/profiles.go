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

// GetPWMSmooth calcule la valeur PWM avec interpolation linéaire (mode smooth).
// IMPORTANT : en dessous du premier point on garde sa vitesse, au-dessus du dernier on garde la sienne
// (sinon une température basse retomberait sur la vitesse du dernier point, soit 100 %).
func (p Profile) GetPWMSmooth(temp int) uintptr {
	pts := p.Points
	if len(pts) == 0 {
		return PercentToPWM(0)
	}
	if temp <= pts[0].Temp {
		return PercentToPWM(uintptr(pts[0].Speed))
	}
	for i := 0; i < len(pts)-1; i++ {
		p1, p2 := pts[i], pts[i+1]
		if temp >= p1.Temp && temp <= p2.Temp && p2.Temp > p1.Temp {
			ratio := float64(temp-p1.Temp) / float64(p2.Temp-p1.Temp)
			speed := float64(p1.Speed) + ratio*(float64(p2.Speed)-float64(p1.Speed))
			return PercentToPWM(uintptr(speed + 0.5))
		}
	}
	return PercentToPWM(uintptr(pts[len(pts)-1].Speed))
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
