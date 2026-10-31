package power

import (
	"fmt"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	powrprof                                     = windows.NewLazyDLL("powrprof.dll")
	procPowerRegisterSuspendResumeNotification   = powrprof.NewProc("PowerRegisterSuspendResumeNotification")
	procPowerUnregisterSuspendResumeNotification = powrprof.NewProc("PowerUnregisterSuspendResumeNotification")
)

const (
	DEVICE_NOTIFY_CALLBACK = 0x00000002
)

type PowerEvent int

const (
	PowerSuspend PowerEvent = iota
	PowerResume
)

const (
	PBT_APMSUSPEND         = 0x0004
	PBT_APMRESUMEAUTOMATIC = 0x0012
	PBT_APMRESUMESUSPEND   = 0x0007
)

type deviceNotifySubscribeParameters struct {
	Callback uintptr
	Context  uintptr
}

var globalCallback func(PowerEvent)

var resumeFired bool

var powerCallbackPtr = windows.NewCallback(func(context uintptr, powerType uint32, setting uintptr) uintptr {
	switch powerType {
	case PBT_APMSUSPEND:
		resumeFired = false
		if globalCallback != nil {
			globalCallback(PowerSuspend)
		}
	case PBT_APMRESUMEAUTOMATIC, PBT_APMRESUMESUSPEND:
		if !resumeFired {
			resumeFired = true
			if globalCallback != nil {
				globalCallback(PowerResume)
			}
		}
	}
	return 0
})

// WatchPowerEvents bloque indéfiniment — à lancer dans une goroutine.
func WatchPowerEvents(onEvent func(PowerEvent)) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	globalCallback = onEvent

	params := deviceNotifySubscribeParameters{
		Callback: powerCallbackPtr,
		Context:  0,
	}

	var handle uintptr
	ret, _, err := procPowerRegisterSuspendResumeNotification.Call(
		DEVICE_NOTIFY_CALLBACK,
		uintptr(unsafe.Pointer(&params)),
		uintptr(unsafe.Pointer(&handle)),
	)
	if ret != 0 {
		fmt.Printf("[power] ERREUR: PowerRegisterSuspendResumeNotification échoué (ret=%d): %v\n", ret, err)
		return
	}
	fmt.Println("[power] PowerRegisterSuspendResumeNotification ✓")
	defer procPowerUnregisterSuspendResumeNotification.Call(handle)

	fmt.Println("[power] En attente d'événements power...")
	select {}
}
