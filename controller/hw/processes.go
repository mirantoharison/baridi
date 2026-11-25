package hw

import (
	"sort"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// RunningProcesses renvoie les noms d'exécutables des processus en cours (« game.exe »), en minuscules, sans doublon et
// triés. Une photo de la table des processus (Toolhelp) suffit : pas besoin de droits sur chaque processus, et le
// contrôleur tourne de toute façon en SYSTEM.
func RunningProcesses() []string {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)

	seen := map[string]struct{}{}
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry)) // IMPORTANT : Toolhelp refuse l'appel si la taille n'est pas renseignée
	for err = windows.Process32First(snap, &entry); err == nil; err = windows.Process32Next(snap, &entry) {
		name := strings.ToLower(windows.UTF16ToString(entry.ExeFile[:]))
		if name != "" {
			seen[name] = struct{}{}
		}
	}
	out := make([]string, 0, len(seen))
	for n := range seen {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// PowerPlanNames : noms des plans d'alimentation standard, dans l'ordre d'affichage. « Personnalisé » regroupe tous les
// autres plans (on ne distingue pas leurs noms : ils sont illisibles dans le registre, voir powerPlans).
func PowerPlanNames() []string {
	return []string{"Équilibré", "Performances élevées", "Performances maximales", "Économie d'énergie", "Personnalisé"}
}

// CurrentPowerPlan renvoie le nom du plan d'alimentation actif (« » si illisible). Beaucoup plus léger que
// ReadSystemInfo : une seule lecture du registre, appelée toutes les quelques secondes par l'automatisation.
func CurrentPowerPlan() string {
	guid := readString(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes`, "ActivePowerScheme")
	if name, ok := powerPlans[guid]; ok {
		return name
	}
	if guid != "" {
		return "Personnalisé"
	}
	return ""
}

// ReadBattery lit l'état de la batterie à la demande, sans passer par le moniteur (qui ne mesure que tant que
// l'interface regarde) : l'automatisation doit savoir si la machine est sur secteur même interface fermée.
func ReadBattery() Battery { return readBattery() }
