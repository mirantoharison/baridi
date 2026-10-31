package main

import "golang.org/x/sys/windows"

// watchParent attend la fin du process parent (l'app Tauri) puis appelle onExit.
// Sans ça, un crash de l'UI laisserait le ventilateur piloté par un sidecar orphelin.
func watchParent(pid int, onExit func()) {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		onExit()
		return
	}
	defer windows.CloseHandle(h)
	windows.WaitForSingleObject(h, windows.INFINITE)
	onExit()
}
