package fan

import (
	"fmt"
	"log"

	"golang.org/x/sys/windows"
)

// CallProc appelle une fonction de la DLL ASUS.
// IMPORTANT : pas de log de succès — l'UI interroge le statut chaque seconde,
// ça noierait la console du sidecar.
func CallProc(name string, proc *windows.LazyProc, args ...uintptr) uintptr {
	ret, _, err := proc.Call(args...)
	if err != windows.ERROR_SUCCESS {
		log.Printf("[WARN] %s → GetLastError: %v", name, err)
	}
	return ret
}

func LoadDLL() *windows.LazyDLL {
	dll := windows.NewLazyDLL("AsusWinIO64.dll")
	if err := dll.Load(); err != nil {
		panic(fmt.Sprintf("Impossible de charger la DLL: %v", err))
	}
	return dll
}
