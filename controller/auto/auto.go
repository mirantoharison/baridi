// Package auto change de profil tout seul selon le contexte : un programme qui tourne, la source d'alimentation
// (secteur ou batterie) ou le plan d'alimentation de Windows.
//
// IMPORTANT : le moteur vit dans le contrôleur, pas dans l'interface. Il doit continuer de fonctionner quand la
// fenêtre est fermée (service Windows : personne n'ouvre l'interface au démarrage).
package auto

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"fanctl/hw"
)

// Types de déclencheur.
const (
	TriggerProcess      = "process"       // Value : nom de l'exécutable, ex. « game.exe »
	TriggerPowerSource  = "power_source"  // Value : « ac » (secteur) ou « battery »
	TriggerPowerPlan    = "power_plan"    // Value : un nom de hw.PowerPlanNames()
	TriggerBatteryBelow = "battery_below" // Value : seuil en %, ex. « 20 » : sur batterie ET en dessous de ce niveau
)

// Rule : « quand <déclencheur> est vrai, utiliser <profil> ».
type Rule struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Trigger string `json:"trigger"`
	Value   string `json:"value"`
	Profile string `json:"profile"`
	// Plan : plan d'alimentation Windows à poser en plus du profil (« » = ne pas y toucher).
	Plan string `json:"plan,omitempty"`
}

// Config est ce qui est enregistré dans automation.json. L'ordre des règles est leur priorité : la première qui
// correspond l'emporte.
type Config struct {
	Enabled bool   `json:"enabled"`
	Rules   []Rule `json:"rules"`
}

// State est ce que l'interface affiche : la configuration et ce que le moteur voit à cet instant.
type State struct {
	Config
	// ActiveRuleID : règle appliquée en ce moment (« » = aucune, le profil de l'utilisateur est en place).
	ActiveRuleID string `json:"active_rule_id"`
	// BaseProfile : profil à restaurer quand plus aucune règle ne correspond (« » = aucune règle appliquée).
	BaseProfile string `json:"base_profile"`
	// Contexte observé, pour que l'utilisateur voie pourquoi une règle s'applique ou non.
	OnBattery bool `json:"on_battery"`
	// BatteryPercent : niveau de la batterie (0 sans batterie).
	BatteryPercent int    `json:"battery_percent"`
	PowerPlan      string `json:"power_plan"`
	// Plans : valeurs possibles du déclencheur « plan d'alimentation ».
	Plans []string `json:"plans"`
}

// Host : ce dont le moteur a besoin du contrôleur. Interface plutôt que dépendance directe pour garder le paquet
// indépendant de fan et testable.
type Host struct {
	// ActiveProfile renvoie l'identifiant du profil actif.
	ActiveProfile func() string
	// ProfileExists dit si un profil existe encore (une règle peut pointer vers un profil supprimé).
	ProfileExists func(id string) bool
	// ApplyProfile active un profil (et le persiste, comme le ferait POST /fan/profile).
	ApplyProfile func(id string) error
	// ActivePlanGUID et ApplyPlanGUID lisent et posent le plan d'alimentation Windows (identifiant, pas nom : un plan
	// personnalisé n'a pas de nom que l'on sache retrouver).
	ActivePlanGUID func() string
	ApplyPlanGUID  func(guid string) error
	// PlanGUID traduit le nom d'un plan standard en identifiant (« » = inconnu).
	PlanGUID func(name string) string
}

// Engine évalue les règles à intervalle régulier.
type Engine struct {
	host Host
	path string

	mu      sync.Mutex
	cfg     Config
	active  string // identifiant de la règle appliquée
	applied string // profil posé par le moteur : si l'utilisateur en choisit un autre, on ne le contredit pas au retour
	base    string
	// basePlan : plan d'alimentation de l'utilisateur avant la première règle ; appliedPlan : plan posé par une règle.
	basePlan, appliedPlan string
	// Observations du dernier tour.
	onBattery bool
	batPct    int
	plan      string
}

// tickInterval : cadence d'évaluation. Un changement de contexte n'a pas à être instantané, et chaque tour lit la
// table des processus.
const tickInterval = 5 * time.Second

// New charge la configuration (absente ou illisible = tout désactivé).
func New(path string, host Host) *Engine {
	e := &Engine{host: host, path: path}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &e.cfg)
	}
	if e.cfg.Rules == nil {
		e.cfg.Rules = []Rule{}
	}
	return e
}

// Run évalue les règles jusqu'à la fermeture de stop.
func (e *Engine) Run(stop <-chan struct{}) {
	tick := time.NewTicker(tickInterval)
	defer tick.Stop()
	for {
		e.evaluate()
		select {
		case <-tick.C:
		case <-stop:
			return
		}
	}
}

// matches dit si une règle est vraie dans le contexte donné.
func matches(r Rule, procs map[string]struct{}, onBattery bool, batPct int, plan string) bool {
	switch r.Trigger {
	case TriggerProcess:
		_, ok := procs[strings.ToLower(strings.TrimSpace(r.Value))]
		return ok
	case TriggerPowerSource:
		return (r.Value == "battery") == onBattery
	case TriggerPowerPlan:
		return plan != "" && r.Value == plan
	case TriggerBatteryBelow:
		// « Sous N % » n'a de sens que sur batterie : branchée, le niveau remonte et la règle n'aurait rien à protéger.
		n, err := strconv.Atoi(strings.TrimSpace(r.Value))
		return err == nil && onBattery && batPct < n
	}
	return false
}

// evaluate observe le contexte et applique ou retire un profil si la règle gagnante a changé.
func (e *Engine) evaluate() {
	e.mu.Lock()
	enabled := e.cfg.Enabled
	rules := append([]Rule(nil), e.cfg.Rules...)
	e.mu.Unlock()

	bat := hw.ReadBattery()
	onBattery := bat.Present && !bat.PluggedIn
	batPct := bat.Percent
	plan := hw.CurrentPowerPlan()

	var winner *Rule
	if enabled {
		// La table des processus n'est lue que si une règle en a besoin.
		var procs map[string]struct{}
		for _, r := range rules {
			if r.Enabled && r.Trigger == TriggerProcess && procs == nil {
				procs = map[string]struct{}{}
				for _, n := range hw.RunningProcesses() {
					procs[n] = struct{}{}
				}
			}
		}
		for i := range rules {
			r := rules[i]
			if r.Enabled && e.host.ProfileExists(r.Profile) && matches(r, procs, onBattery, batPct, plan) {
				winner = &rules[i]
				break
			}
		}
	}

	e.mu.Lock()
	defer e.mu.Unlock()
	e.onBattery, e.batPct, e.plan = onBattery, batPct, plan

	winnerID := ""
	if winner != nil {
		winnerID = winner.ID
	}
	if winnerID == e.active {
		return // rien n'a changé : on ne contredit pas un choix manuel fait entre-temps
	}

	switch {
	case winner != nil:
		if e.active == "" {
			e.base = e.host.ActiveProfile() // profil de l'utilisateur, à rendre quand tout s'éteint
			e.basePlan = e.host.ActivePlanGUID()
		}
		if err := e.host.ApplyProfile(winner.Profile); err == nil {
			e.applied = winner.Profile
			e.active = winnerID
		}
		e.applyRulePlanLocked(winner.Plan)
	default:
		// Plus aucune règle : on rend le profil d'origine, sauf si l'utilisateur en a choisi un autre depuis.
		if e.base != "" && e.host.ActiveProfile() == e.applied && e.host.ProfileExists(e.base) {
			_ = e.host.ApplyProfile(e.base)
		}
		e.restorePlanLocked()
		e.active, e.base, e.applied = "", "", ""
	}
}

// applyRulePlanLocked pose le plan de la règle gagnante, ou rend celui de l'utilisateur si cette règle n'en demande pas
// alors que la précédente en avait posé un. e.mu doit être tenu.
func (e *Engine) applyRulePlanLocked(name string) {
	if e.host.ApplyPlanGUID == nil {
		return
	}
	if name == "" {
		e.restorePlanLocked()
		return
	}
	guid := e.host.PlanGUID(name)
	if guid == "" || e.host.ActivePlanGUID() == guid {
		return
	}
	if err := e.host.ApplyPlanGUID(guid); err == nil {
		e.appliedPlan = guid
	}
}

// restorePlanLocked rend le plan d'alimentation de l'utilisateur, sauf s'il en a choisi un autre depuis. e.mu doit être tenu.
func (e *Engine) restorePlanLocked() {
	if e.host.ApplyPlanGUID != nil && e.appliedPlan != "" && e.basePlan != "" && e.host.ActivePlanGUID() == e.appliedPlan {
		_ = e.host.ApplyPlanGUID(e.basePlan)
	}
	e.appliedPlan = ""
}

// State renvoie la configuration et l'état courant.
func (e *Engine) State() State {
	e.mu.Lock()
	defer e.mu.Unlock()
	return State{
		Config:         Config{Enabled: e.cfg.Enabled, Rules: append([]Rule{}, e.cfg.Rules...)},
		ActiveRuleID:   e.active,
		BaseProfile:    e.base,
		OnBattery:      e.onBattery,
		BatteryPercent: e.batPct,
		PowerPlan:      e.plan,
		Plans:          hw.PowerPlanNames(),
	}
}

const maxRules = 50

// Validate refuse une configuration incohérente : l'interface est de confiance, mais un fichier ou une requête
// manuelle ne le sont pas.
func Validate(cfg Config) error {
	if len(cfg.Rules) > maxRules {
		return fmt.Errorf("trop de règles (maximum %d)", maxRules)
	}
	ids := map[string]bool{}
	for _, r := range cfg.Rules {
		if r.ID == "" || ids[r.ID] {
			return errors.New("chaque règle doit avoir un identifiant unique")
		}
		ids[r.ID] = true
		if r.Profile == "" {
			return fmt.Errorf("règle « %s » : profil manquant", r.Name)
		}
		v := strings.TrimSpace(r.Value)
		if r.Plan != "" && hw.PlanGUIDByName(r.Plan) == "" {
			return fmt.Errorf("règle « %s » : plan d'alimentation inconnu", r.Name)
		}
		switch r.Trigger {
		case TriggerProcess:
			if v == "" || strings.ContainsAny(v, `\/`) {
				return fmt.Errorf("règle « %s » : indique un nom d'exécutable, sans chemin (ex. game.exe)", r.Name)
			}
		case TriggerPowerSource:
			if v != "ac" && v != "battery" {
				return fmt.Errorf("règle « %s » : source inconnue", r.Name)
			}
		case TriggerBatteryBelow:
			if n, err := strconv.Atoi(v); err != nil || n < 1 || n > 99 {
				return fmt.Errorf("règle « %s » : indique un niveau de batterie entre 1 et 99 %%", r.Name)
			}
		case TriggerPowerPlan:
			known := false
			for _, p := range hw.PowerPlanNames() {
				known = known || p == v
			}
			if !known {
				return fmt.Errorf("règle « %s » : plan d'alimentation inconnu", r.Name)
			}
		default:
			return fmt.Errorf("règle « %s » : déclencheur inconnu", r.Name)
		}
	}
	return nil
}

// Save valide, enregistre et applique une nouvelle configuration. Le prochain tour (ou l'appel immédiat à evaluate)
// en tire les conséquences.
func (e *Engine) Save(cfg Config) error {
	if err := Validate(cfg); err != nil {
		return err
	}
	if cfg.Rules == nil {
		cfg.Rules = []Rule{}
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(e.path, data, 0o644); err != nil {
		return err
	}
	e.mu.Lock()
	e.cfg = cfg
	e.mu.Unlock()
	e.evaluate() // effet immédiat : l'utilisateur ne doit pas attendre le prochain tour pour voir sa règle jouer
	return nil
}
