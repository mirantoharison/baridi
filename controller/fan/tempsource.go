package fan

import "fmt"

// Source de température de la courbe, et courbe propre du second ventilateur.
//
// IMPORTANT : la température GPU vient d'un fournisseur branché par main (hw.Monitor.GPUTemp). Il renvoie 0 quand la
// carte est absente ou en veille profonde (on ne la réveille jamais pour la mesurer) : on retombe alors sur la
// température du processeur, jamais sur 0, qui ferait ralentir le ventilateur.

// Sources de température acceptées.
const (
	// TempSourceCPU : la courbe suit la température du processeur seule (comportement d'origine).
	TempSourceCPU = "cpu"
	// TempSourceGPU : la courbe suit la température de la carte graphique (second ventilateur seulement).
	TempSourceGPU = "gpu"
	// TempSourceMax : la courbe suit la plus haute des deux : un jeu qui chauffe la GPU accélère le ventilateur
	// même si le processeur reste frais.
	TempSourceMax = "max"
)

// SetGPUTempProvider branche la lecture de la température GPU (0 = indisponible).
func (c *Controller) SetGPUTempProvider(fn func() int) {
	c.mu.Lock()
	c.gpuTempFn = fn
	c.mu.Unlock()
}

// gpuTemp renvoie la température GPU, ou 0.
func (c *Controller) gpuTemp() uintptr {
	c.mu.Lock()
	fn := c.gpuTempFn
	c.mu.Unlock()
	if fn == nil {
		return 0
	}
	if t := fn(); t > 0 {
		return uintptr(t)
	}
	return 0
}

// tempFor calcule la température suivie pour une source donnée, à partir de celle du processeur.
func (c *Controller) tempFor(source string, cpu uintptr) uintptr {
	gpu := uintptr(0)
	if source == TempSourceGPU || source == TempSourceMax {
		gpu = c.gpuTemp()
	}
	switch {
	case source == TempSourceGPU && gpu > 0:
		return gpu
	case source == TempSourceMax && gpu > cpu:
		return gpu
	}
	return cpu
}

// SetTempSource choisit la température qui pilote la courbe du ventilateur 1 : « cpu » ou « max ».
func (c *Controller) SetTempSource(source string) error {
	if source == "" {
		source = TempSourceCPU
	}
	if source != TempSourceCPU && source != TempSourceMax {
		return fmt.Errorf("unknown temp source %q (cpu or max)", source)
	}
	c.mu.Lock()
	c.TempSource = source
	c.mu.Unlock()
	return nil
}

// Fan2CurveConfig est la courbe propre du second ventilateur et la température qui la pilote.
type Fan2CurveConfig struct {
	Points []CurvePoint `json:"points"`
	// Source : « cpu », « gpu » ou « max ».
	Source string `json:"source"`
}

const (
	minFan2CurvePoints = 2
	maxFan2CurvePoints = 10
	// fan2CurveMinTopSpeed : vitesse minimale du dernier point. Une courbe qui reste basse à haute température
	// laisserait la carte graphique chauffer sans refroidissement.
	fan2CurveMinTopSpeed = 60
)

// ValidateFan2Curve refuse une courbe incohérente ou dangereuse.
func ValidateFan2Curve(cfg Fan2CurveConfig) error {
	switch cfg.Source {
	case TempSourceCPU, TempSourceGPU, TempSourceMax:
	default:
		return fmt.Errorf("unknown source %q", cfg.Source)
	}
	pts := cfg.Points
	if len(pts) < minFan2CurvePoints || len(pts) > maxFan2CurvePoints {
		return fmt.Errorf("the curve needs %d to %d points", minFan2CurvePoints, maxFan2CurvePoints)
	}
	for i, p := range pts {
		if p.Temp < 20 || p.Temp > 110 || p.Speed < 0 || p.Speed > 100 {
			return fmt.Errorf("point %d out of range (temp 20-110, speed 0-100)", i+1)
		}
		if i > 0 && (p.Temp <= pts[i-1].Temp || p.Speed < pts[i-1].Speed) {
			return fmt.Errorf("point %d: temperatures must increase and speeds must not decrease", i+1)
		}
	}
	if pts[len(pts)-1].Speed < fan2CurveMinTopSpeed {
		return fmt.Errorf("the last point must be at least %d%% (a cool curve at high temperature is unsafe)", fan2CurveMinTopSpeed)
	}
	return nil
}

// fan2CurvePWM calcule la consigne du second ventilateur selon sa courbe (interpolation linéaire) et la température suivie.
func (c *Controller) fan2CurvePWM(cpu uintptr) uintptr {
	c.mu.Lock()
	cfg := c.fan2Curve
	c.mu.Unlock()
	temp := c.tempFor(cfg.Source, cpu)
	return Profile{Points: cfg.Points}.GetPWMSmooth(int(temp))
}

// Fan2CurveState renvoie la courbe du second ventilateur (zéro si jamais définie).
func (c *Controller) Fan2CurveState() Fan2CurveConfig {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.fan2Curve
}

// SetFan2Curve enregistre la courbe du second ventilateur et le passe en mode « courbe ».
func (c *Controller) SetFan2Curve(cfg Fan2CurveConfig) error {
	if c.fanCount < 2 {
		return fmt.Errorf("la DLL n'annonce pas deux ventilateurs (fan_count=%d)", c.fanCount)
	}
	if err := ValidateFan2Curve(cfg); err != nil {
		return err
	}
	c.mu.Lock()
	c.fan2Curve = cfg
	c.mu.Unlock()
	return c.SetFan2(Fan2Curve, 0)
}
