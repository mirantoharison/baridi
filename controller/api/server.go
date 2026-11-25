// Package api expose le contrôle ventilateur en HTTP + SSE pour l'UI Tauri.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"fanctl/auto"
	"fanctl/fan"
	"fanctl/history"
	"fanctl/hw"
)

type Server struct {
	controller *fan.Controller
	store      *fan.ProfileStore
	onQuit     func()
	// onCurveMode persiste le choix (appelé après chaque changement).
	onCurveMode func(mode string)
	// onProfile persiste le profil actif (appelé après chaque changement).
	onProfile func(id string)
	// onTuning persiste les réglages fins (appelé après chaque changement).
	onTuning func(t fan.Tuning)
	// onFan2Mode persiste le mode du second ventilateur (appelé après chaque changement).
	onFan2Mode func(mode string)
	// onTempSource et onFan2Curve persistent la source de température et la courbe du second ventilateur.
	onTempSource func(source string)
	onFan2Curve  func(cfg fan.Fan2CurveConfig)
	// history : historique long (nil = absent).
	history *history.Store
	// health : relevés quotidiens de la santé de la batterie (nil = absent).
	health *history.HealthStore
	// key : clé partagée exigée sur toutes les routes sauf /health (voir auth.go).
	key string
	// monitor : mesures du processeur et de la carte graphique (nil = non affichées).
	monitor *hw.Monitor
	// automation : changement de profil selon le contexte (nil = fonction absente).
	automation *auto.Engine
	// info : identité du contrôleur, renseignée par main (voir SetInfo).
	info Info
	// startedAt sert à calculer la durée de fonctionnement dans /info.
	startedAt time.Time
}

// Info décrit ce contrôleur (route GET /info) : utile au support, et pour la page « À propos ».
type Info struct {
	Version      string `json:"version"`
	PID          int    `json:"pid"`
	UptimeS      int64  `json:"uptime_s"`
	Dir          string `json:"dir"`
	SettingsPath string `json:"settings_path"`
	ProfilesPath string `json:"profiles_path"`
	// Service vaut true quand le contrôleur tourne comme service Windows (pas de /quit), false en sidecar.
	Service bool `json:"service"`
	// FanCount : nombre de ventilateurs annoncé par la DLL (-1 = inconnu). Calculé à la volée dans handleInfo.
	FanCount int `json:"fan_count"`
}

// SetInfo renseigne ce que /info expose (chemins, version) ; la durée et le mode sont calculés à la volée.
func (s *Server) SetInfo(i Info) { s.info = i }

// SetAutomation branche le moteur d'automatisation sur les routes /automation.
func (s *Server) SetAutomation(e *auto.Engine) { s.automation = e }

// SetMonitor branche les mesures du processeur et de la carte graphique sur le statut.
func (s *Server) SetMonitor(m *hw.Monitor) { s.monitor = m }

// OnTuning enregistre le callback de persistance des réglages fins.
func (s *Server) OnTuning(fn func(t fan.Tuning)) { s.onTuning = fn }

// OnFan2Mode enregistre le callback de persistance du mode du second ventilateur.
func (s *Server) OnFan2Mode(fn func(mode string)) { s.onFan2Mode = fn }

// OnTempSource enregistre le callback de persistance de la source de température.
func (s *Server) OnTempSource(fn func(source string)) { s.onTempSource = fn }

// OnFan2Curve enregistre le callback de persistance de la courbe du second ventilateur.
func (s *Server) OnFan2Curve(fn func(cfg fan.Fan2CurveConfig)) { s.onFan2Curve = fn }

// SetHistory branche l'historique long sur les routes /history.
func (s *Server) SetHistory(h *history.Store) { s.history = h }

// SetHealth branche le suivi quotidien de la batterie sur /battery/health.
func (s *Server) SetHealth(h *history.HealthStore) { s.health = h }

// OnProfile enregistre le callback de persistance du profil actif.
func (s *Server) OnProfile(fn func(id string)) { s.onProfile = fn }

// OnCurveMode enregistre le callback de persistance du mode de courbe.
func (s *Server) OnCurveMode(fn func(mode string)) { s.onCurveMode = fn }

func NewServer(c *fan.Controller, store *fan.ProfileStore, onQuit func()) *Server {
	return &Server{controller: c, store: store, onQuit: onQuit, startedAt: time.Now()}
}

// Status est la forme unique renvoyée par /status et poussée par /events.
type Status struct {
	Mode      string `json:"mode"`
	Profile   string `json:"profile"`
	CurveMode string `json:"curve_mode"`
	// HysteresisC et Smoothing : réglages fins du pilotage auto (POST /fan/tuning).
	HysteresisC int     `json:"hysteresis_c"`
	Smoothing   string  `json:"smoothing"`
	TempFilterS int     `json:"temp_filter_s"`
	TempC       uintptr `json:"temp_c"`
	RPM         uintptr `json:"rpm"`
	PWM         uintptr `json:"pwm"`
	Percent     uintptr `json:"percent"`
	// FanCount : nombre de ventilateurs annoncé par la DLL ASUS au démarrage (-1 = elle ne le dit pas).
	FanCount int `json:"fan_count"`
	// Fan2RPM est absent si la DLL n'annonce pas deux ventilateurs.
	Fan2RPM *uintptr `json:"fan2_rpm,omitempty"`
	// Fan2Mode : "firmware", "follow" ou "manual" ; Fan2Percent : consigne du mode manuel (POST /fan/fan2).
	Fan2Mode    string  `json:"fan2_mode,omitempty"`
	Fan2Percent uintptr `json:"fan2_percent,omitempty"`
	// BIOSOverride : le firmware pilote les deux ventilateurs, la courbe du profil est ignorée (retour au firmware
	// après une commande du ventilateur 2).
	BIOSOverride bool `json:"bios_override,omitempty"`
	// CPU et GPU : état du processeur et de la carte graphique NVIDIA pour l'affichage (voir package hw). GPU est
	// absent sans carte NVIDIA.
	CPU *hw.CPU `json:"cpu,omitempty"`
	GPU *hw.GPU `json:"gpu,omitempty"`
	// RAM et Battery : mémoire vive et batterie (Battery.Present est faux sur une machine sans batterie).
	RAM     *hw.RAM     `json:"ram,omitempty"`
	Battery *hw.Battery `json:"battery,omitempty"`
	// TempSource : « cpu » ou « max » — température qui pilote la courbe du ventilateur 1.
	TempSource string `json:"temp_source"`
	// Fan2Curve : courbe propre du second ventilateur, présente une fois définie.
	Fan2Curve *fan.Fan2CurveConfig `json:"fan2_curve,omitempty"`
	// BatteryETAMin : autonomie estimée en minutes d'après la consommation des 10 dernières minutes (absente branchée).
	BatteryETAMin *int `json:"battery_eta_min,omitempty"`
	// BatteryDetails : usure, cycles, tension et puissance instantanée.
	BatteryDetails *hw.BatteryDetails `json:"battery_details,omitempty"`
	// Sensors : capteurs supplémentaires de la DLL ASUS, absent tant qu'aucun n'a répondu (modèle non pris en charge).
	Sensors *fan.ExtraSensors `json:"sensors,omitempty"`
}

func (s *Server) snapshot() Status {
	temp, rpm, pwm, percent := s.controller.Status()
	st := Status{
		Mode:        s.controller.Mode,
		Profile:     s.controller.ActiveProfile.ID,
		CurveMode:   s.controller.CurveMode,
		HysteresisC: s.controller.HysteresisC,
		Smoothing:   s.controller.Smoothing,
		TempFilterS: s.controller.TempFilterS,
		FanCount:    s.controller.FanCount(),
		TempSource:  s.controller.TempSource,
		TempC:       temp, RPM: rpm, PWM: pwm, Percent: percent,
	}
	if rpm2, detected := s.controller.Fan2(); detected {
		st.Fan2RPM = &rpm2
		st.Fan2Mode, st.Fan2Percent = s.controller.Fan2Control()
		st.BIOSOverride = s.controller.BIOSOverride()
		if curve := s.controller.Fan2CurveState(); len(curve.Points) > 0 {
			st.Fan2Curve = &curve
		}
	}
	if d, ok := s.batteryDetails(); ok {
		st.BatteryDetails = &d
		st.BatteryETAMin = s.batteryETA(d)
	}
	if s.monitor != nil {
		// Demander l'état signale aussi au moniteur que quelqu'un regarde (il cesse de mesurer sinon, voir hw.idleAfter).
		snap := s.monitor.Snapshot()
		st.CPU, st.GPU, st.RAM = &snap.CPU, snap.GPU, snap.RAM
		if snap.Battery.Present {
			st.Battery = &snap.Battery
		}
	}
	// Même principe pour les capteurs de la DLL : on ne les lit que tant que quelqu'un les demande.
	s.controller.TouchExtras()
	if extra := s.controller.Extra(); extra.Any() {
		st.Sensors = &extra
		if st.BatteryDetails != nil && extra.BatteryCycles > 0 && st.BatteryDetails.CycleCount == 0 {
			st.BatteryDetails.CycleCount = extra.BatteryCycles // le pilote Windows ne les donne pas : le contrôleur embarqué si
		}
	}
	return st
}

// handleFan2 règle la commande du second ventilateur : {"mode":"firmware"|"follow"|"manual","percent":N}.
// `percent` ne sert qu'en mode manuel. Refusé si la DLL n'annonce pas deux ventilateurs.
func (s *Server) handleFan2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errJSON(w, 405, "method not allowed")
		return
	}
	var body struct {
		Mode    string           `json:"mode"`
		Percent uintptr          `json:"percent"`
		Curve   []fan.CurvePoint `json:"curve"`
		Source  string           `json:"source"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		errJSON(w, 400, "invalid JSON")
		return
	}
	var err error
	if body.Mode == fan.Fan2Curve && len(body.Curve) > 0 {
		cfg := fan.Fan2CurveConfig{Points: body.Curve, Source: body.Source}
		if err = s.controller.SetFan2Curve(cfg); err == nil && s.onFan2Curve != nil {
			s.onFan2Curve(cfg)
		}
	} else {
		err = s.controller.SetFan2(body.Mode, body.Percent)
	}
	if err != nil {
		errJSON(w, 400, err.Error())
		return
	}
	if s.onFan2Mode != nil {
		s.onFan2Mode(body.Mode)
	}
	writeJSON(w, 200, s.snapshot())
}

// handleStats renvoie les statistiques de session du contrôleur (température min/max/moyenne, temps au-dessus de seuils).
// Route à part plutôt que dans le statut : elles changent lentement et n'ont pas à être poussées chaque seconde.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.controller.Stats())
}

// handleSystem renvoie l'identité de la machine (modèle, BIOS, plan d'alimentation, durée depuis le démarrage de Windows).
func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, hw.ReadSystemInfo())
}

// handleAutomation : GET renvoie la configuration et l'état du moteur, POST remplace la configuration
// ({"enabled":bool,"rules":[...]}) et renvoie le nouvel état.
func (s *Server) handleAutomation(w http.ResponseWriter, r *http.Request) {
	if s.automation == nil {
		errJSON(w, 404, "automation unavailable")
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, 200, s.automation.State())
	case http.MethodPost:
		var cfg auto.Config
		if json.NewDecoder(r.Body).Decode(&cfg) != nil {
			errJSON(w, 400, "invalid JSON")
			return
		}
		if err := s.automation.Save(cfg); err != nil {
			errJSON(w, 400, err.Error())
			return
		}
		writeJSON(w, 200, s.automation.State())
	default:
		errJSON(w, 405, "method not allowed")
	}
}

// handleAutomationApps liste les programmes de la machine (en cours, enregistrés, installés) pour le sélecteur de règle.
func (s *Server) handleAutomationApps(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"apps": hw.ListApps()})
}

// handleAutomationIcon renvoie l'icône PNG d'un programme de la liste (?name=game.exe), gardée en cache sur disque.
// 404 si le programme est inconnu ou n'a pas d'icône : l'interface affiche alors une icône générique.
func (s *Server) handleAutomationIcon(w http.ResponseWriter, r *http.Request) {
	data, err := hw.AppIcon(r.URL.Query().Get("name"))
	if err != nil {
		errJSON(w, 404, err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Write(data)
}

// handleFanTest : POST lance le test actif des ventilateurs (409 s'il tourne déjà), GET renvoie sa progression.
func (s *Server) handleFanTest(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, 200, s.controller.FanTestState())
	case http.MethodPost:
		if err := s.controller.StartFanTest(); err != nil {
			errJSON(w, 409, err.Error())
			return
		}
		writeJSON(w, 200, s.controller.FanTestState())
	default:
		errJSON(w, 405, "method not allowed")
	}
}

// handlePowerPlan : GET renvoie le plan actif et les plans installés, POST {"plan":"Équilibré"} en active un.
func (s *Server) handlePowerPlan(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, 200, map[string]any{"active": hw.CurrentPowerPlan(), "available": hw.AvailablePowerPlans()})
	case http.MethodPost:
		var body struct {
			Plan string `json:"plan"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			errJSON(w, 400, "invalid JSON")
			return
		}
		if err := hw.SetPowerPlan(body.Plan); err != nil {
			errJSON(w, 400, err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"active": hw.CurrentPowerPlan(), "available": hw.AvailablePowerPlans()})
	default:
		errJSON(w, 405, "method not allowed")
	}
}

// handleTempSource règle la température qui pilote la courbe du ventilateur 1 : {"source":"cpu"|"max"}.
func (s *Server) handleTempSource(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errJSON(w, 405, "method not allowed")
		return
	}
	var body struct {
		Source string `json:"source"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		errJSON(w, 400, "invalid JSON")
		return
	}
	if err := s.controller.SetTempSource(body.Source); err != nil {
		errJSON(w, 400, err.Error())
		return
	}
	if s.onTempSource != nil {
		s.onTempSource(body.Source)
	}
	writeJSON(w, 200, s.snapshot())
}

// batteryCache évite d'interroger le pilote de batterie à chaque tick SSE (1 s) et chaque connexion.
var batteryCache struct {
	mu sync.Mutex
	d  hw.BatteryDetails
	ok bool
	at time.Time
}

const batteryCacheFor = 5 * time.Second

func (s *Server) batteryDetails() (hw.BatteryDetails, bool) {
	batteryCache.mu.Lock()
	defer batteryCache.mu.Unlock()
	if time.Since(batteryCache.at) > batteryCacheFor {
		batteryCache.d, batteryCache.ok = hw.ReadBatteryDetails()
		batteryCache.at = time.Now()
	}
	return batteryCache.d, batteryCache.ok
}

// handleHistory renvoie l'historique long : ?hours=24&points=240 (réduit par moyenne à `points` points au plus).
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if s.history == nil {
		errJSON(w, 404, "history unavailable")
		return
	}
	hours := atoiDefault(r.URL.Query().Get("hours"), 24)
	points := atoiDefault(r.URL.Query().Get("points"), 240)
	samples := s.history.Query(time.Duration(hours)*time.Hour, points)
	if samples == nil {
		samples = []history.Sample{} // [] et non null : l'interface distingue « vide » de « pas encore lu »
	}
	writeJSON(w, 200, map[string]any{"samples": samples})
}

// handleHistoryAnalysis renvoie le diagnostic d'encrassement calculé sur tout l'historique.
func (s *Server) handleHistoryAnalysis(w http.ResponseWriter, r *http.Request) {
	if s.history == nil {
		errJSON(w, 404, "history unavailable")
		return
	}
	writeJSON(w, 200, s.history.AnalyzeFouling())
}

// batteryETA estime l'autonomie restante en minutes. IMPORTANT : on se base sur la consommation MOYENNE des dix
// dernières minutes (historique), pas sur la puissance du moment : l'estimation de Windows saute d'une valeur à l'autre
// à chaque pic de charge. Branchée, ou sans consommation connue, il n'y a pas d'estimation.
func (s *Server) batteryETA(d hw.BatteryDetails) *int {
	if d.CapacityMWh <= 0 || s.history == nil || !d.HasPower || d.PowerW >= 0 {
		return nil // branchée ou en charge (puissance positive), ou pas de mesure
	}
	avg, ok := s.history.AvgDischargeW(10 * time.Minute)
	if !ok {
		avg = -d.PowerW // peu d'historique sur batterie : la valeur instantanée vaut mieux que rien
	}
	if avg < 0.5 {
		return nil
	}
	minutes := int(float64(d.CapacityMWh) / 1000 / avg * 60)
	return &minutes
}

// handleHistoryThermal renvoie la répartition des températures et la consigne moyenne par tranche.
func (s *Server) handleHistoryThermal(w http.ResponseWriter, r *http.Request) {
	if s.history == nil {
		errJSON(w, 404, "history unavailable")
		return
	}
	writeJSON(w, 200, s.history.ThermalProfile())
}

// handleBatteryHealth renvoie un relevé de santé de la batterie par jour.
func (s *Server) handleBatteryHealth(w http.ResponseWriter, r *http.Request) {
	if s.health == nil {
		errJSON(w, 404, "battery health unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{"points": s.health.Points()})
}

// handleHistorySummary renvoie le résumé des dernières 24 heures.
func (s *Server) handleHistorySummary(w http.ResponseWriter, r *http.Request) {
	if s.history == nil {
		errJSON(w, 404, "history unavailable")
		return
	}
	writeJSON(w, 200, s.history.Summarize())
}

func atoiDefault(v string, def int) int {
	if n, err := strconv.Atoi(v); err == nil && n > 0 {
		return n
	}
	return def
}

// handleInfo renvoie l'identité du contrôleur. La durée de fonctionnement et le mode sont calculés ici.
func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	i := s.info
	i.UptimeS = int64(time.Since(s.startedAt).Seconds())
	i.Service = s.onQuit == nil
	i.FanCount = s.controller.FanCount()
	writeJSON(w, 200, i)
}

func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"ok": "1"})
	})
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/events", s.handleEvents)
	mux.HandleFunc("/fan/manual", s.handleManual)
	mux.HandleFunc("/fan/auto", s.post(func() { s.controller.StartAuto() }))
	mux.HandleFunc("/fan/stop", s.post(func() { s.controller.StopAuto() }))
	mux.HandleFunc("/fan/profile", s.handleProfile)
	mux.HandleFunc("/fan/curve-mode", s.handleCurveMode)
	mux.HandleFunc("/fan/tuning", s.handleTuning)
	mux.HandleFunc("/fan/fan2", s.handleFan2)
	mux.HandleFunc("/fan/temp-source", s.handleTempSource)
	mux.HandleFunc("/history", s.handleHistory)
	mux.HandleFunc("/history/analysis", s.handleHistoryAnalysis)
	mux.HandleFunc("/history/summary", s.handleHistorySummary)
	mux.HandleFunc("/history/thermal", s.handleHistoryThermal)
	mux.HandleFunc("/battery/health", s.handleBatteryHealth)
	mux.HandleFunc("/info", s.handleInfo)
	mux.HandleFunc("/stats", s.handleStats)
	mux.HandleFunc("/system", s.handleSystem)
	mux.HandleFunc("/power-plan", s.handlePowerPlan)
	mux.HandleFunc("/diagnostic/fan-test", s.handleFanTest)
	mux.HandleFunc("/automation", s.handleAutomation)
	mux.HandleFunc("/automation/apps", s.handleAutomationApps)
	mux.HandleFunc("/automation/icon", s.handleAutomationIcon)
	mux.HandleFunc("/fan/profiles", s.handleProfiles)
	mux.HandleFunc("/fan/profiles/", s.handleProfileByID)
	// /quit n'existe que pour le sidecar. En service, onQuit est nil : une UI qui se ferme ne doit
	// surtout pas arrêter le contrôleur.
	mux.HandleFunc("/quit", func(w http.ResponseWriter, r *http.Request) {
		if s.onQuit == nil {
			errJSON(w, 403, "quit disabled")
			return
		}
		s.post(func() { go s.onQuit() })(w, r)
	})
	fmt.Println("Controller API on", addr)
	// Ordre : cors d'abord (origine, pré-contrôle OPTIONS), puis la clé, puis les routes.
	return http.ListenAndServe(addr, cors(requireKey(s.key, mux)))
}

// allowedOrigins : origines de l'UI Tauri (selon la plateforme) et du serveur de dev Vite.
var allowedOrigins = map[string]bool{
	"tauri://localhost":       true,
	"http://tauri.localhost":  true,
	"https://tauri.localhost": true,
	"http://localhost:5173":   true,
	"http://127.0.0.1:5173":   true,
}

// cors n'autorise que les origines de l'UI.
// IMPORTANT : le contrôleur tourne en SYSTEM et écoute sur loopback. N'importe quelle page web ouverte
// dans un navigateur pourrait sinon lui envoyer des requêtes (ex. couper le ventilateur). Un navigateur
// envoie toujours l'en-tête Origin sur une requête cross-origin : on rejette tout ce qui n'est pas de l'UI,
// y compris les requêtes « simples » que le preflight CORS ne bloquerait pas.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" {
			if !allowedOrigins[o] {
				errJSON(w, http.StatusForbidden, "origin not allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", o)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func errJSON(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// post enveloppe une action sans corps : POST only, renvoie le statut courant.
func (s *Server) post(fn func()) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errJSON(w, 405, "method not allowed")
			return
		}
		fn()
		writeJSON(w, 200, s.snapshot())
	}
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.snapshot())
}

// handleEvents pousse le statut chaque seconde (SSE) — évite le polling côté UI.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		errJSON(w, 500, "SSE not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		b, _ := json.Marshal(s.snapshot())
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
		select {
		case <-tick.C:
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleManual(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errJSON(w, 405, "method not allowed")
		return
	}
	var body struct {
		Percent uintptr `json:"percent"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		errJSON(w, 400, "invalid JSON")
		return
	}
	s.controller.SetManual(body.Percent)
	writeJSON(w, 200, s.snapshot())
}

func (s *Server) handleProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errJSON(w, 405, "method not allowed")
		return
	}
	var body struct {
		Profile string `json:"profile"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		errJSON(w, 400, "invalid JSON")
		return
	}
	p, ok := s.store.Get(body.Profile)
	if !ok {
		errJSON(w, 400, "unknown profile")
		return
	}
	s.controller.SetActiveProfile(p)
	if s.onProfile != nil {
		s.onProfile(p.ID)
	}
	writeJSON(w, 200, s.snapshot())
}

func (s *Server) handleCurveMode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errJSON(w, 405, "method not allowed")
		return
	}
	var body struct {
		Mode string `json:"mode"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		errJSON(w, 400, "invalid JSON")
		return
	}
	if err := s.controller.SetCurveMode(body.Mode); err != nil {
		errJSON(w, 400, err.Error())
		return
	}
	if s.onCurveMode != nil {
		s.onCurveMode(body.Mode)
	}
	writeJSON(w, 200, s.snapshot())
}

// handleTuning règle l'hystérésis, le lissage et le filtre de température.
// Tous les champs sont optionnels : un champ absent garde sa valeur actuelle, ce qui permet à l'UI de
// n'envoyer que ce qui a changé.
func (s *Server) handleTuning(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errJSON(w, 405, "method not allowed")
		return
	}
	var body struct {
		HysteresisC *int    `json:"hysteresis_c"`
		Smoothing   *string `json:"smoothing"`
		TempFilterS *int    `json:"temp_filter_s"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		errJSON(w, 400, "invalid JSON")
		return
	}
	t := fan.Tuning{HysteresisC: s.controller.HysteresisC, Smoothing: s.controller.Smoothing, TempFilterS: s.controller.TempFilterS}
	if body.HysteresisC != nil {
		t.HysteresisC = *body.HysteresisC
	}
	if body.Smoothing != nil {
		t.Smoothing = *body.Smoothing
	}
	if body.TempFilterS != nil {
		t.TempFilterS = *body.TempFilterS
	}
	if err := s.controller.SetTuning(t); err != nil {
		errJSON(w, 400, err.Error())
		return
	}
	if s.onTuning != nil {
		s.onTuning(t)
	}
	writeJSON(w, 200, s.snapshot())
}

func (s *Server) handleProfiles(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, 200, map[string]any{"profiles": s.store.GetAll()})
	case http.MethodPost:
		var p fan.Profile
		if json.NewDecoder(r.Body).Decode(&p) != nil {
			errJSON(w, 400, "invalid JSON")
			return
		}
		if p.ID == "" || len(p.Points) == 0 {
			errJSON(w, 400, "id and points are required")
			return
		}
		if err := s.store.Save(p); err != nil {
			errJSON(w, 403, err.Error())
			return
		}
		writeJSON(w, 200, p)
	default:
		errJSON(w, 405, "method not allowed")
	}
}

func (s *Server) handleProfileByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		errJSON(w, 405, "method not allowed")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/fan/profiles/")
	if err := s.store.Delete(id); err != nil {
		errJSON(w, 403, err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"deleted": id})
}
