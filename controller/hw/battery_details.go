package hw

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// BatteryDetails complète Battery (niveau, secteur) avec ce que seul le pilote de batterie donne : usure, cycles,
// tension et puissance instantanée. Tout vient de l'API de batterie de Windows (IOCTL), pas de la DLL ASUS : elle est
// lente et sérialisée avec le pilotage des ventilateurs.
type BatteryDetails struct {
	// DesignedMWh : capacité d'origine ; FullChargedMWh : capacité actuelle à pleine charge ; CapacityMWh : énergie restante.
	DesignedMWh    int `json:"designed_mwh"`
	FullChargedMWh int `json:"full_charged_mwh"`
	CapacityMWh    int `json:"capacity_mwh"`
	// WearPercent : usure = part de capacité perdue depuis l'origine (0 = neuve).
	WearPercent float64 `json:"wear_percent"`
	// CycleCount : cycles de charge complets (0 = le pilote ne le dit pas).
	CycleCount int `json:"cycle_count"`
	VoltageMV  int `json:"voltage_mv"`
	// PowerW : puissance instantanée en watts, positive en charge, négative en décharge. Absente si le pilote ne la donne pas.
	PowerW    float64 `json:"power_w"`
	HasPower  bool    `json:"has_power"`
	Chemistry string  `json:"chemistry,omitempty"`
}

var guidDeviceBattery = windows.GUID{Data1: 0x72631e54, Data2: 0x78a4, Data3: 0x11d0, Data4: [8]byte{0xbc, 0xf7, 0x00, 0xaa, 0x00, 0xb7, 0xb3, 0x2a}}

const (
	ioctlBatteryQueryTag         = 0x294040
	ioctlBatteryQueryInformation = 0x294044
	ioctlBatteryQueryStatus      = 0x29404c
	batteryUnknownRate           = 0x80000000
)

type batteryQueryInformation struct {
	BatteryTag       uint32
	InformationLevel uint32 // 0 = BatteryInformation
	AtRate           int32
}

type batteryInformation struct {
	Capabilities     uint32
	Technology       uint8
	Reserved         [3]uint8
	Chemistry        [4]byte
	DesignedCapacity uint32
	FullChargedCapac uint32
	DefaultAlert1    uint32
	DefaultAlert2    uint32
	CriticalBias     uint32
	CycleCount       uint32
}

type batteryWaitStatus struct {
	BatteryTag, Timeout, PowerState, LowCapacity, HighCapacity uint32
}

type batteryStatus struct {
	PowerState, Capacity, Voltage uint32
	Rate                          int32
}

// ReadBatteryDetails interroge le pilote de la première batterie. ok est faux sans batterie ou si le pilote refuse.
func ReadBatteryDetails() (BatteryDetails, bool) {
	paths, err := windows.CM_Get_Device_Interface_List("", &guidDeviceBattery, 0)
	if err != nil || len(paths) == 0 {
		return BatteryDetails{}, false
	}
	p, err := windows.UTF16PtrFromString(paths[0])
	if err != nil {
		return BatteryDetails{}, false
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ|windows.GENERIC_WRITE, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil, windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return BatteryDetails{}, false
	}
	defer windows.CloseHandle(h)

	var tag, returned uint32
	var timeout uint32
	if windows.DeviceIoControl(h, ioctlBatteryQueryTag, (*byte)(unsafe.Pointer(&timeout)), 4, (*byte)(unsafe.Pointer(&tag)), 4, &returned, nil) != nil || tag == 0 {
		return BatteryDetails{}, false
	}

	var info batteryInformation
	q := batteryQueryInformation{BatteryTag: tag}
	if windows.DeviceIoControl(h, ioctlBatteryQueryInformation, (*byte)(unsafe.Pointer(&q)), uint32(unsafe.Sizeof(q)), (*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)), &returned, nil) != nil {
		return BatteryDetails{}, false
	}
	d := BatteryDetails{
		DesignedMWh:    int(info.DesignedCapacity),
		FullChargedMWh: int(info.FullChargedCapac),
		CycleCount:     int(info.CycleCount),
		Chemistry:      trimNul(string(info.Chemistry[:])),
	}
	if d.DesignedMWh > 0 && d.FullChargedMWh > 0 {
		d.WearPercent = 100 * float64(d.DesignedMWh-d.FullChargedMWh) / float64(d.DesignedMWh)
		if d.WearPercent < 0 {
			d.WearPercent = 0 // certaines batteries annoncent un peu plus que l'origine au début
		}
	}

	var st batteryStatus
	w := batteryWaitStatus{BatteryTag: tag}
	if windows.DeviceIoControl(h, ioctlBatteryQueryStatus, (*byte)(unsafe.Pointer(&w)), uint32(unsafe.Sizeof(w)), (*byte)(unsafe.Pointer(&st)), uint32(unsafe.Sizeof(st)), &returned, nil) == nil {
		d.CapacityMWh = int(st.Capacity)
		d.VoltageMV = int(st.Voltage)
		if uint32(st.Rate) != batteryUnknownRate {
			d.PowerW, d.HasPower = float64(st.Rate)/1000, true
		}
	}
	return d, true
}

// trimNul retire les octets nuls de fin (le champ de chimie fait 4 octets fixes, souvent « LION »).
func trimNul(s string) string {
	for len(s) > 0 && s[len(s)-1] == 0 {
		s = s[:len(s)-1]
	}
	return s
}
