// Package hw lit l'état du processeur et de la carte graphique pour l'affichage (charge, fréquence, mémoire, puissance).
//
// IMPORTANT : tout est en LECTURE SEULE et passe par des API Windows ou NVIDIA documentées, jamais par la DLL ASUS :
// ses appels sont lents (0,3 à 2 s) et sérialisés avec le pilotage des ventilateurs (voir fan/sensors.go).
package hw

import (
	"fmt"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// CPU est l'état du processeur à un instant donné.
type CPU struct {
	Name    string `json:"name"`
	Threads int    `json:"threads"`
	// BaseMHz : fréquence de base annoncée par le fabricant. FreqMHz : fréquence réelle estimée (turbo compris).
	BaseMHz      int     `json:"base_mhz"`
	FreqMHz      int     `json:"freq_mhz"`
	UsagePercent float64 `json:"usage_percent"`
	// Cores : charge de chaque thread logique, en %, dans l'ordre de Windows (vide si la lecture est indisponible).
	Cores []int `json:"cores,omitempty"`
	// CoreFreqMHz : fréquence estimée de chaque thread logique, dans le même ordre que Cores (vide si indisponible).
	CoreFreqMHz []int `json:"core_freq_mhz,omitempty"`
	// Throttled : limitation probable — la fréquence réelle est nettement sous la fréquence de base alors que le
	// processeur est chargé. C'est une déduction, pas une lecture directe d'un indicateur matériel.
	Throttled bool `json:"throttled"`
}

const (
	// throttleFreqRatio : en dessous de cette part de la fréquence de base, le processeur est jugé bridé…
	throttleFreqRatio = 0.85
	// throttleMinUsage : … mais seulement s'il est réellement sollicité (au repos, il descend volontairement très bas).
	throttleMinUsage = 60.0
)

var (
	kernel32         = windows.NewLazySystemDLL("kernel32.dll")
	procSystemTimes  = kernel32.NewProc("GetSystemTimes")
	pdh              = windows.NewLazySystemDLL("pdh.dll")
	pdhOpenQuery     = pdh.NewProc("PdhOpenQueryW")
	pdhAddCounter    = pdh.NewProc("PdhAddEnglishCounterW")
	pdhCollectData   = pdh.NewProc("PdhCollectQueryData")
	pdhFormattedFunc = pdh.NewProc("PdhGetFormattedCounterValue")
	pdhFormattedArr  = pdh.NewProc("PdhGetFormattedCounterArrayW")
)

const (
	// pdhFmtDouble : demande une valeur de compteur en nombre à virgule flottante.
	pdhFmtDouble = 0x00000200
	// perfCounterPath : « % Processor Performance » = fréquence actuelle / fréquence de base, en %, turbo compris
	// (peut dépasser 100). C'est le calcul du Gestionnaire des tâches pour afficher la fréquence réelle.
	perfCounterPath = `\Processor Information(_Total)\% Processor Performance`
)

// pdhValue reproduit PDH_FMT_COUNTERVALUE sous x64 : un statut, puis une union alignée sur 8 octets
// (d'où le remplissage de 4 octets avant le double).
type pdhValue struct {
	Status uint32
	_      uint32
	Double float64
}

// cpuSampler garde ce qu'il faut entre deux mesures : la charge se calcule sur la différence de deux relevés.
type cpuSampler struct {
	name    string
	baseMHz int

	hasPrev                        bool
	prevIdle, prevKernel, prevUser uint64
	// prevCores : relevé précédent par thread logique (voir cores.go).
	prevCores []coreTimes

	pdhQuery, pdhCounter uintptr
	pdhOK                bool
	// pdhCoreCounter : même compteur « % Processor Performance » mais pour chaque thread (caractère générique).
	pdhCoreCounter uintptr
}

func newCPUSampler() *cpuSampler {
	s := &cpuSampler{}
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE, `HARDWARE\DESCRIPTION\System\CentralProcessor\0`, registry.QUERY_VALUE); err == nil {
		defer k.Close()
		if name, _, err := k.GetStringValue("ProcessorNameString"); err == nil {
			s.name = trimSpaces(name)
		}
		if mhz, _, err := k.GetIntegerValue("~MHz"); err == nil {
			s.baseMHz = int(mhz)
		}
	}
	s.initPDH()
	// Premier relevé de charge : sans lui, la première mesure comparerait à zéro.
	s.sampleTimes()
	return s
}

// trimSpaces enlève les espaces de tête et de fin (le registre en laisse dans le nom commercial).
func trimSpaces(s string) string {
	start, end := 0, len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}

func (s *cpuSampler) initPDH() {
	var query uintptr
	if r, _, _ := pdhOpenQuery.Call(0, 0, uintptr(unsafe.Pointer(&query))); r != 0 {
		return
	}
	path, err := windows.UTF16PtrFromString(perfCounterPath)
	if err != nil {
		return
	}
	var counter uintptr
	if r, _, _ := pdhAddCounter.Call(query, uintptr(unsafe.Pointer(path)), 0, uintptr(unsafe.Pointer(&counter))); r != 0 {
		return
	}
	// Fréquence par thread : un compteur à caractère générique renvoie un tableau (un élément par thread, plus _Total).
	if cp, err := windows.UTF16PtrFromString(`\Processor Information(*)\% Processor Performance`); err == nil {
		var cc uintptr
		if r, _, _ := pdhAddCounter.Call(query, uintptr(unsafe.Pointer(cp)), 0, uintptr(unsafe.Pointer(&cc))); r == 0 {
			s.pdhCoreCounter = cc
		}
	}
	// Les compteurs de taux ont besoin de deux collectes : on fait la première ici.
	pdhCollectData.Call(query)
	s.pdhQuery, s.pdhCounter, s.pdhOK = query, counter, true
}

// perfPercent renvoie le « % Processor Performance » courant, ou false si le compteur est indisponible.
func (s *cpuSampler) perfPercent() (float64, bool) {
	if !s.pdhOK {
		return 0, false
	}
	if r, _, _ := pdhCollectData.Call(s.pdhQuery); r != 0 {
		return 0, false
	}
	var counterType uint32
	var v pdhValue
	r, _, _ := pdhFormattedFunc.Call(s.pdhCounter, pdhFmtDouble, uintptr(unsafe.Pointer(&counterType)), uintptr(unsafe.Pointer(&v)))
	if r != 0 || v.Status != 0 {
		return 0, false
	}
	return v.Double, true
}

func fileTimeToUint64(ft windows.Filetime) uint64 {
	return uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime)
}

// sampleTimes lit les temps cumulés (repos, noyau, utilisateur) du système. Le temps « noyau » INCLUT le temps de repos.
func (s *cpuSampler) sampleTimes() (idle, kernel, user uint64, ok bool) {
	var i, k, u windows.Filetime
	r, _, _ := procSystemTimes.Call(uintptr(unsafe.Pointer(&i)), uintptr(unsafe.Pointer(&k)), uintptr(unsafe.Pointer(&u)))
	if r == 0 {
		return 0, 0, 0, false
	}
	return fileTimeToUint64(i), fileTimeToUint64(k), fileTimeToUint64(u), true
}

// Sample mesure le processeur. La charge est celle écoulée depuis l'appel précédent.
func (s *cpuSampler) Sample() CPU {
	out := CPU{Name: s.name, Threads: runtime.NumCPU(), BaseMHz: s.baseMHz, FreqMHz: s.baseMHz}

	if idle, kernel, user, ok := s.sampleTimes(); ok {
		if s.hasPrev {
			dIdle := idle - s.prevIdle
			dTotal := (kernel - s.prevKernel) + (user - s.prevUser) // kernel contient déjà idle
			if dTotal > 0 {
				out.UsagePercent = 100 * float64(dTotal-dIdle) / float64(dTotal)
			}
		}
		s.prevIdle, s.prevKernel, s.prevUser, s.hasPrev = idle, kernel, user, true
	}
	if out.UsagePercent < 0 {
		out.UsagePercent = 0
	}

	if perf, ok := s.perfPercent(); ok && s.baseMHz > 0 {
		out.FreqMHz = int(float64(s.baseMHz) * perf / 100)
		out.CoreFreqMHz = s.corePerf()
	}
	out.Cores = s.sampleCores()
	out.Throttled = s.baseMHz > 0 &&
		float64(out.FreqMHz) < throttleFreqRatio*float64(s.baseMHz) &&
		out.UsagePercent >= throttleMinUsage
	return out
}

// pdhItem reproduit PDH_FMT_COUNTERVALUE_ITEM_W : le nom de l'instance, puis la valeur formatée.
type pdhItem struct {
	Name *uint16
	Val  pdhValue
}

const pdhMoreData = 0x800007D2

// corePerf renvoie la fréquence estimée de chaque thread logique, en MHz (nil si le compteur est indisponible).
// Appelé juste après perfPercent, qui a déjà collecté les données de la requête.
func (s *cpuSampler) corePerf() []int {
	if s.pdhCoreCounter == 0 || s.baseMHz == 0 {
		return nil
	}
	var size, count uint32
	r, _, _ := pdhFormattedArr.Call(s.pdhCoreCounter, pdhFmtDouble, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), 0)
	if r != pdhMoreData || size == 0 {
		return nil
	}
	buf := make([]byte, size)
	if r, _, _ := pdhFormattedArr.Call(s.pdhCoreCounter, pdhFmtDouble, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), uintptr(unsafe.Pointer(&buf[0]))); r != 0 {
		return nil
	}
	freqs := map[int]int{}
	maxIdx := -1
	items := unsafe.Slice((*pdhItem)(unsafe.Pointer(&buf[0])), count)
	for _, it := range items {
		name := windows.UTF16PtrToString(it.Name) // « 0,3 » : groupe de processeurs, numéro du thread ; « _Total » est ignoré
		var group, idx int
		if _, err := fmt.Sscanf(name, "%d,%d", &group, &idx); err != nil || it.Val.Status != 0 {
			continue
		}
		freqs[idx] = int(float64(s.baseMHz) * it.Val.Double / 100)
		if idx > maxIdx {
			maxIdx = idx
		}
	}
	if maxIdx < 0 {
		return nil
	}
	out := make([]int, maxIdx+1)
	for i := range out {
		out[i] = freqs[i]
	}
	return out
}
