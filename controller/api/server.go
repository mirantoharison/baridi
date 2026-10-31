// Package api expose le contrôle ventilateur en HTTP + SSE pour l'UI Tauri.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"fanctl/fan"
)

type Server struct {
	controller *fan.Controller
	store      *fan.ProfileStore
	onQuit     func()
	// onCurveMode persiste le choix (appelé après chaque changement).
	onCurveMode func(mode string)
	// onProfile persiste le profil actif (appelé après chaque changement).
	onProfile func(id string)
}

// OnProfile enregistre le callback de persistance du profil actif.
func (s *Server) OnProfile(fn func(id string)) { s.onProfile = fn }

// OnCurveMode enregistre le callback de persistance du mode de courbe.
func (s *Server) OnCurveMode(fn func(mode string)) { s.onCurveMode = fn }

func NewServer(c *fan.Controller, store *fan.ProfileStore, onQuit func()) *Server {
	return &Server{controller: c, store: store, onQuit: onQuit}
}

// Status est la forme unique renvoyée par /status et poussée par /events.
type Status struct {
	Mode      string  `json:"mode"`
	Profile   string  `json:"profile"`
	CurveMode string  `json:"curve_mode"`
	TempC     uintptr `json:"temp_c"`
	RPM       uintptr `json:"rpm"`
	PWM       uintptr `json:"pwm"`
	Percent   uintptr `json:"percent"`
}

func (s *Server) snapshot() Status {
	temp, rpm, pwm, percent := s.controller.Status()
	return Status{
		Mode:      s.controller.Mode,
		Profile:   s.controller.ActiveProfile.ID,
		CurveMode: s.controller.CurveMode,
		TempC:     temp, RPM: rpm, PWM: pwm, Percent: percent,
	}
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
	return http.ListenAndServe(addr, cors(mux))
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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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
