package hw

import (
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

// RAM : mémoire vive utilisée et totale.
type RAM struct {
	TotalMB      int     `json:"total_mb"`
	UsedMB       int     `json:"used_mb"`
	UsagePercent float64 `json:"usage_percent"`
}

// Battery : état de la batterie. Present vaut false sur une machine sans batterie (le reste est alors à zéro).
type Battery struct {
	Present   bool `json:"present"`
	Percent   int  `json:"percent"`
	PluggedIn bool `json:"plugged_in"`
	Charging  bool `json:"charging"`
	// MinutesLeft : autonomie estimée sur batterie, -1 si inconnue (branchée, ou Windows ne l'a pas encore calculée).
	MinutesLeft int `json:"minutes_left"`
}

// SystemInfo : identité de la machine (change rarement : à lire une fois) et durée depuis le démarrage de Windows.
type SystemInfo struct {
	Manufacturer string `json:"manufacturer"`
	Model        string `json:"model"`
	BIOSVersion  string `json:"bios_version"`
	BIOSDate     string `json:"bios_date"`
	PowerPlan    string `json:"power_plan"`
	// UptimeS : secondes depuis le démarrage de Windows (démarrage rapide compris, donc pas depuis le dernier « allumer »).
	UptimeS int64 `json:"uptime_s"`
}

var (
	procMemoryStatus = kernel32.NewProc("GlobalMemoryStatusEx")
	procPowerStatus  = kernel32.NewProc("GetSystemPowerStatus")
	procTickCount64  = kernel32.NewProc("GetTickCount64")
)

// memoryStatusEx reproduit MEMORYSTATUSEX (64 octets).
type memoryStatusEx struct {
	Length                       uint32
	MemoryLoad                   uint32
	TotalPhys, AvailPhys         uint64
	TotalPageFile, AvailPageFile uint64
	TotalVirtual, AvailVirtual   uint64
	AvailExtendedVirtual         uint64
}

// systemPowerStatus reproduit SYSTEM_POWER_STATUS (12 octets).
type systemPowerStatus struct {
	ACLineStatus        byte
	BatteryFlag         byte
	BatteryLifePercent  byte
	SystemStatusFlag    byte
	BatteryLifeTime     uint32
	BatteryFullLifeTime uint32
}

const (
	batteryFlagCharging = 8
	batteryFlagNone     = 128
	// unknownByte et unknownLifeTime : valeurs « inconnu » de GetSystemPowerStatus.
	unknownByte     = 255
	unknownLifeTime = 0xFFFFFFFF
)

// readRAM lit la mémoire vive. ok est faux si Windows refuse (ne devrait pas arriver).
func readRAM() (RAM, bool) {
	ms := memoryStatusEx{Length: uint32(unsafe.Sizeof(memoryStatusEx{}))}
	if r, _, _ := procMemoryStatus.Call(uintptr(unsafe.Pointer(&ms))); r == 0 {
		return RAM{}, false
	}
	total := int(ms.TotalPhys / bytesPerMB)
	used := int((ms.TotalPhys - ms.AvailPhys) / bytesPerMB)
	return RAM{TotalMB: total, UsedMB: used, UsagePercent: float64(ms.MemoryLoad)}, true
}

// readBattery lit l'état de la batterie.
func readBattery() Battery {
	var ps systemPowerStatus
	if r, _, _ := procPowerStatus.Call(uintptr(unsafe.Pointer(&ps))); r == 0 {
		return Battery{MinutesLeft: -1}
	}
	b := Battery{MinutesLeft: -1}
	if ps.BatteryFlag&batteryFlagNone != 0 && ps.BatteryFlag != unknownByte {
		return b // pas de batterie
	}
	b.Present = true
	if ps.BatteryLifePercent != unknownByte {
		b.Percent = int(ps.BatteryLifePercent)
	}
	b.PluggedIn = ps.ACLineStatus == 1
	b.Charging = ps.BatteryFlag&batteryFlagCharging != 0
	if ps.BatteryLifeTime != unknownLifeTime && !b.PluggedIn {
		b.MinutesLeft = int(ps.BatteryLifeTime / 60)
	}
	return b
}

// powerPlans : plans d'alimentation standard de Windows, par identifiant. Leur nom dans le registre est une référence de
// ressource (« @%SystemRoot%\system32\powrprof.dll,-14 »), illisible : on traduit les plans connus et on nomme les autres.
var powerPlans = map[string]string{
	"381b4222-f694-41f0-9685-ff5bb260df2e": "Équilibré",
	"8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c": "Performances élevées",
	"a1841308-3541-4fab-bc81-f71556f20b4a": "Économie d'énergie",
	"e9a42b02-d5df-448d-aa00-03f14749eb61": "Performances maximales",
}

func readString(root registry.Key, path, name string) string {
	k, err := registry.OpenKey(root, path, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, err := k.GetStringValue(name)
	if err != nil {
		return ""
	}
	return trimSpaces(v)
}

// ReadSystemInfo lit l'identité de la machine (registre) et la durée depuis le démarrage.
func ReadSystemInfo() SystemInfo {
	const bios = `HARDWARE\DESCRIPTION\System\BIOS`
	info := SystemInfo{
		Manufacturer: readString(registry.LOCAL_MACHINE, bios, "SystemManufacturer"),
		Model:        readString(registry.LOCAL_MACHINE, bios, "SystemProductName"),
		BIOSVersion:  readString(registry.LOCAL_MACHINE, bios, "BIOSVersion"),
		BIOSDate:     readString(registry.LOCAL_MACHINE, bios, "BIOSReleaseDate"),
	}
	guid := readString(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes`, "ActivePowerScheme")
	if name, ok := powerPlans[guid]; ok {
		info.PowerPlan = name
	} else if guid != "" {
		info.PowerPlan = "Personnalisé"
	}
	if ms, _, _ := procTickCount64.Call(); ms != 0 {
		info.UptimeS = int64(ms / 1000)
	}
	return info
}
