package hw

import (
	"errors"
	"os/exec"
	"regexp"
	"strings"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

// Changement du plan d'alimentation Windows. On passe par powercfg.exe : c'est l'outil officiel, il applique le plan
// pour toute la machine (le contrôleur tourne en SYSTEM), et une API non documentée n'apporterait rien de plus.

var guidPattern = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// PlanGUIDByName renvoie l'identifiant d'un plan standard (« » pour « Personnalisé » ou un nom inconnu).
func PlanGUIDByName(name string) string {
	for guid, n := range powerPlans {
		if n == name {
			return guid
		}
	}
	return ""
}

// CurrentPowerPlanGUID renvoie l'identifiant du plan actif (« » si illisible).
func CurrentPowerPlanGUID() string {
	return strings.ToLower(readString(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes`, "ActivePowerScheme"))
}

// runPowercfg lance powercfg sans ouvrir de fenêtre de console.
func runPowercfg(args ...string) (string, error) {
	cmd := exec.Command("powercfg", args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// AvailablePowerPlans renvoie les noms des plans standard réellement installés : « Performances maximales », par
// exemple, est masqué par Windows sur la plupart des machines. « Personnalisé » n'est jamais proposé (on ne le choisit pas).
func AvailablePowerPlans() []string {
	out, err := runPowercfg("/list")
	if err != nil {
		return nil
	}
	installed := map[string]bool{}
	for _, g := range guidPattern.FindAllString(out, -1) {
		installed[strings.ToLower(g)] = true
	}
	var names []string
	for _, n := range PowerPlanNames() {
		if guid := PlanGUIDByName(n); guid != "" && installed[guid] {
			names = append(names, n)
		}
	}
	return names
}

// SetPowerPlanByGUID active un plan par son identifiant.
func SetPowerPlanByGUID(guid string) error {
	if !guidPattern.MatchString(guid) {
		return errors.New("identifiant de plan invalide")
	}
	if out, err := runPowercfg("/setactive", guid); err != nil {
		return errors.New("powercfg a refusé le plan : " + strings.TrimSpace(out))
	}
	return nil
}

// SetPowerPlan active un plan standard par son nom.
func SetPowerPlan(name string) error {
	guid := PlanGUIDByName(name)
	if guid == "" {
		return errors.New("plan inconnu ou non sélectionnable : " + name)
	}
	return SetPowerPlanByGUID(guid)
}
