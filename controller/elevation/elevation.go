package elevation

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

func IsAdmin() bool {
	_, err := os.Open("\\\\.\\PHYSICALDRIVE0")
	return err == nil
}

func IsSystem() bool {
	sid, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		return false
	}
	token := windows.Token(0)
	err = windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token)
	if err != nil {
		return false
	}
	defer token.Close()
	ok, _ := token.IsMember(sid)
	return ok
}

func RelaunchAsAdmin() {
	shell32 := windows.NewLazyDLL("shell32.dll")
	shellExecute := shell32.NewProc("ShellExecuteW")

	exe, _ := os.Executable()
	exe, _ = filepath.EvalSymlinks(exe)
	exePtr, _ := windows.UTF16PtrFromString(exe)
	verb, _ := windows.UTF16PtrFromString("runas")
	args, _ := windows.UTF16PtrFromString("--elevated")

	shellExecute.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(exePtr)),
		uintptr(unsafe.Pointer(args)),
		0,
		1,
	)
}

func RelaunchAsSystem() {
	exe, _ := os.Executable()
	exe, _ = filepath.EvalSymlinks(exe)
	exeDir := filepath.Dir(exe)
	psexec := filepath.Join(exeDir, "psexec.exe")

	// Récupère l'ID de session actuelle
	sessionID := os.Getenv("SESSIONNAME")
	fmt.Printf("[DEBUG] Session: %s\n", sessionID)

	cmd := exec.Command(psexec, "-s", "-i", "1", "-accepteula", "-nobanner", exe, "--elevated")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil {
		fmt.Printf("[ERROR] PsExec failed: %v\n", err)
	}
}

func EnableSeDebugPrivilege() error {
	var token windows.Token
	proc := windows.CurrentProcess()
	err := windows.OpenProcessToken(proc, windows.TOKEN_ADJUST_PRIVILEGES|windows.TOKEN_QUERY, &token)
	if err != nil {
		return fmt.Errorf("OpenProcessToken: %w", err)
	}
	defer token.Close()

	var luid windows.LUID
	err = windows.LookupPrivilegeValue(nil, windows.StringToUTF16Ptr("SeDebugPrivilege"), &luid)
	if err != nil {
		return fmt.Errorf("LookupPrivilegeValue: %w", err)
	}

	privs := windows.Tokenprivileges{
		PrivilegeCount: 1,
		Privileges: [1]windows.LUIDAndAttributes{{
			Luid:       luid,
			Attributes: windows.SE_PRIVILEGE_ENABLED,
		}},
	}

	return windows.AdjustTokenPrivileges(token, false, &privs, 0, nil, nil)
}
