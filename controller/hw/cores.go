package hw

import (
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Charge par thread logique, via NtQuerySystemInformation(SystemProcessorPerformanceInformation).
//
// IMPORTANT : cette fonction n'est documentée que par son nom dans les en-têtes du SDK, mais c'est celle qu'utilisent le
// Gestionnaire des tâches et les outils de supervision courants. La charge se calcule comme pour le total : sur la
// différence de deux relevés, le temps « noyau » incluant le temps de repos.

var procNtQuerySystemInformation = windows.NewLazySystemDLL("ntdll.dll").NewProc("NtQuerySystemInformation")

const (
	systemProcessorPerformanceInformation = 8
	// coreRecordSize : taille de SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION sous x64 (cinq entiers de 64 bits, un compteur
	// d'interruptions de 32 bits et son remplissage).
	coreRecordSize = 48
)

// coreTimes : temps cumulés d'un thread logique, en intervalles de 100 ns.
type coreTimes struct{ idle, kernel, user int64 }

// readCoreTimes lit les temps cumulés de chaque thread logique. Renvoie nil si Windows refuse.
func readCoreTimes() []coreTimes {
	n := runtime.NumCPU()
	buf := make([]byte, n*coreRecordSize)
	var returned uint32
	status, _, _ := procNtQuerySystemInformation.Call(
		systemProcessorPerformanceInformation,
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
		uintptr(unsafe.Pointer(&returned)),
	)
	if status != 0 {
		return nil
	}
	count := int(returned) / coreRecordSize
	out := make([]coreTimes, 0, count)
	for i := 0; i < count; i++ {
		rec := buf[i*coreRecordSize:]
		out = append(out, coreTimes{
			idle:   *(*int64)(unsafe.Pointer(&rec[0])),
			kernel: *(*int64)(unsafe.Pointer(&rec[8])),
			user:   *(*int64)(unsafe.Pointer(&rec[16])),
		})
	}
	return out
}

// sampleCores renvoie la charge de chaque thread logique depuis le relevé précédent (nil au premier appel ou en cas d'échec).
func (s *cpuSampler) sampleCores() []int {
	cur := readCoreTimes()
	prev := s.prevCores
	s.prevCores = cur
	if cur == nil || len(prev) != len(cur) {
		return nil
	}
	out := make([]int, len(cur))
	for i := range cur {
		dTotal := (cur[i].kernel - prev[i].kernel) + (cur[i].user - prev[i].user) // kernel contient déjà idle
		dIdle := cur[i].idle - prev[i].idle
		if dTotal > 0 {
			pct := 100 * float64(dTotal-dIdle) / float64(dTotal)
			if pct < 0 {
				pct = 0
			}
			if pct > 100 {
				pct = 100
			}
			out[i] = int(pct + 0.5)
		}
	}
	return out
}
