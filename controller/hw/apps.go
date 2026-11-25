package hw

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// App est un programme que l'utilisateur peut cibler dans une règle d'automatisation.
type App struct {
	// Name : nom de l'exécutable en minuscules (« game.exe »), la valeur comparée aux processus en cours.
	Name string `json:"name"`
	// Path : chemin complet connu (sert à extraire l'icône). Jamais renvoyé à l'interface : voir json:"-".
	Path string `json:"-"`
	// Running : le programme tourne en ce moment.
	Running bool `json:"running"`
}

// Fichiers qui ressemblent à des exécutables mais que personne ne voudrait cibler.
var ignoredPrefixes = []string{"unins", "uninstall", "setup", "install", "crashpad", "crashreport", "update", "vc_redist", "dxsetup", "redist"}

func isTargetable(name string) bool {
	if !strings.HasSuffix(name, ".exe") {
		return false
	}
	for _, p := range ignoredPrefixes {
		if strings.HasPrefix(name, p) {
			return false
		}
	}
	return true
}

// cleanExePath extrait un chemin d'exécutable d'une valeur de registre : retire les guillemets, l'index d'icône
// (« C:\a.exe,0 ») et les arguments.
func cleanExePath(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if v[0] == '"' {
		if end := strings.Index(v[1:], `"`); end >= 0 {
			v = v[1 : end+1]
		}
	} else if i := strings.Index(strings.ToLower(v), ".exe"); i >= 0 {
		v = v[:i+4]
	}
	if i := strings.LastIndex(v, ","); i > 0 && strings.HasSuffix(strings.ToLower(v[:i]), ".exe") {
		v = v[:i]
	}
	if !strings.HasSuffix(strings.ToLower(v), ".exe") {
		return ""
	}
	return v
}

// processPaths renvoie, pour chaque exécutable en cours, son chemin complet (vide si illisible).
func processPaths() map[string]string {
	out := map[string]string{}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return out
	}
	defer windows.CloseHandle(snap)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = windows.Process32First(snap, &entry); err == nil; err = windows.Process32Next(snap, &entry) {
		name := strings.ToLower(windows.UTF16ToString(entry.ExeFile[:]))
		if name == "" {
			continue
		}
		if out[name] != "" {
			continue
		}
		out[name] = ""
		h, herr := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, entry.ProcessID)
		if herr != nil {
			continue
		}
		buf := make([]uint16, windows.MAX_PATH*2)
		n := uint32(len(buf))
		if windows.QueryFullProcessImageName(h, 0, &buf[0], &n) == nil {
			out[name] = windows.UTF16ToString(buf[:n])
		}
		windows.CloseHandle(h)
	}
	return out
}

// subKeys liste les sous-clés d'une clé de registre (nil si elle n'existe pas).
func subKeys(root registry.Key, path string, access uint32) (registry.Key, []string) {
	k, err := registry.OpenKey(root, path, registry.ENUMERATE_SUB_KEYS|access)
	if err != nil {
		return 0, nil
	}
	names, _ := k.ReadSubKeyNames(-1)
	return k, names
}

// ListApps recense les programmes de la machine : ceux qui tournent, ceux déclarés dans « App Paths » et ceux dont un
// programme de désinstallation indique l'icône ou le dossier d'installation (la plupart des jeux et applications).
// Sans doublon sur le nom d'exécutable, triés par nom. Les programmes en cours viennent en premier dans l'interface,
// pas ici : c'est un champ, l'interface décide du tri.
func ListApps() []App {
	apps := scanApps()
	appsCache.mu.Lock()
	appsCache.apps, appsCache.at = apps, time.Now()
	appsCache.mu.Unlock()
	return apps
}

// appsCache évite de reparcourir le registre pour chaque icône demandée (des centaines d'appels à la suite).
var appsCache struct {
	mu   sync.Mutex
	apps []App
	at   time.Time
}

const appsCacheTTL = 5 * time.Minute

func scanApps() []App {
	byName := map[string]*App{}
	add := func(path string) {
		path = cleanExePath(path)
		if path == "" {
			return
		}
		name := strings.ToLower(filepath.Base(path))
		if !isTargetable(name) {
			return
		}
		if a, ok := byName[name]; ok {
			if a.Path == "" {
				a.Path = path
			}
			return
		}
		byName[name] = &App{Name: name, Path: path}
	}

	// 1. Programmes en cours (le nom compte même sans chemin lisible).
	for name, path := range processPaths() {
		if !strings.HasSuffix(name, ".exe") {
			continue
		}
		a := byName[name]
		if a == nil {
			a = &App{Name: name}
			byName[name] = a
		}
		a.Running = true
		if a.Path == "" {
			a.Path = path
		}
	}

	// 2. App Paths : le nom de la sous-clé est l'exécutable, la valeur par défaut son chemin.
	for _, root := range []registry.Key{registry.LOCAL_MACHINE, registry.CURRENT_USER} {
		const base = `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths`
		k, names := subKeys(root, base, registry.QUERY_VALUE)
		if k == 0 {
			continue
		}
		for _, n := range names {
			add(readString(root, base+`\`+n, ""))
			if strings.HasSuffix(strings.ToLower(n), ".exe") {
				if _, ok := byName[strings.ToLower(n)]; !ok && isTargetable(strings.ToLower(n)) {
					byName[strings.ToLower(n)] = &App{Name: strings.ToLower(n)}
				}
			}
		}
		k.Close()
	}

	// 3. Désinstallation : DisplayIcon (souvent l'exécutable lui-même) et InstallLocation (dossier à parcourir).
	for _, u := range []struct {
		root registry.Key
		path string
	}{
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
	} {
		k, names := subKeys(u.root, u.path, registry.QUERY_VALUE)
		if k == 0 {
			continue
		}
		for _, n := range names {
			sub := u.path + `\` + n
			add(readString(u.root, sub, "DisplayIcon"))
			if dir := strings.Trim(readString(u.root, sub, "InstallLocation"), `" `); dir != "" {
				addTopLevelExes(dir, add)
			}
		}
		k.Close()
	}

	out := make([]App, 0, len(byName))
	for _, a := range byName {
		out = append(out, *a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// addTopLevelExes ajoute les .exe situés directement dans un dossier d'installation. Un seul niveau : parcourir tout
// l'arbre de chaque programme serait lent, et l'exécutable principal est presque toujours à la racine.
func addTopLevelExes(dir string, add func(string)) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".exe") {
			add(filepath.Join(dir, e.Name()))
		}
	}
}

// AppPath renvoie le chemin connu d'un exécutable de la liste (« » s'il est inconnu). L'icône n'est extraite que pour un
// nom présent dans cette liste : l'interface ne peut pas faire lire un fichier arbitraire au contrôleur.
func AppPath(name string) string {
	name = strings.ToLower(name)
	appsCache.mu.Lock()
	apps, fresh := appsCache.apps, time.Since(appsCache.at) < appsCacheTTL
	appsCache.mu.Unlock()
	if !fresh {
		apps = ListApps()
	}
	for _, a := range apps {
		if a.Name == name {
			return a.Path
		}
	}
	return ""
}

// pidNames associe chaque identifiant de processus au nom de son exécutable (minuscules).
func pidNames() map[uint32]string {
	out := map[uint32]string{}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return out
	}
	defer windows.CloseHandle(snap)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = windows.Process32First(snap, &entry); err == nil; err = windows.Process32Next(snap, &entry) {
		out[entry.ProcessID] = strings.ToLower(windows.UTF16ToString(entry.ExeFile[:]))
	}
	return out
}
