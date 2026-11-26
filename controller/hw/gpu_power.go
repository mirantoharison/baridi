package hw

import (
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// État d'alimentation de la carte graphique NVIDIA (Optimus) : « D0 » = allumée, « D3 » = en veille profonde.
//
// IMPORTANT : on lit l'état dans le gestionnaire de périphériques de Windows (CM_POWER_DATA), PAS via NVML. Interroger
// NVML sur une carte endormie la réveille ; ce contrôle, lui, ne la dérange pas, et permet de n'appeler NVML que
// lorsque la carte est déjà allumée.

var (
	cfgmgr32                  = windows.NewLazySystemDLL("cfgmgr32.dll")
	procGetDevNodeRegProperty = cfgmgr32.NewProc("CM_Get_DevNode_Registry_PropertyW")
	guidDevClassDisplay       = windows.GUID{Data1: 0x4d36e968, Data2: 0xe325, Data3: 0x11ce, Data4: [8]byte{0xbf, 0xc1, 0x08, 0x00, 0x2b, 0xe1, 0x04, 0x08}}
)

const cmDrpDevicePowerData = 0x1f

// cmPowerData : début de CM_POWER_DATA (le reste ne nous sert pas).
type cmPowerData struct {
	Size            uint32
	MostRecentState uint32 // 1 = D0, 2 = D1, 3 = D2, 4 = D3
	Capabilities    uint32
}

// nvidiaDevInst repère le périphérique d'affichage NVIDIA (0 s'il n'y en a pas). Cherché une fois : il ne change pas.
var nvidiaDevInst uint32
var nvidiaDevInstDone bool

var procLocateDevNode = cfgmgr32.NewProc("CM_Locate_DevNodeW")

// findNvidiaDevInst parcourt le registre des périphériques PCI (fournisseur 10DE = NVIDIA) pour trouver la carte
// d'affichage, puis demande son identifiant de nœud à Windows. Le registre plutôt que SetupAPI : l'énumération par
// classe renvoie une liste vide pour un service.
func findNvidiaDevInst() uint32 {
	if nvidiaDevInstDone {
		return nvidiaDevInst
	}
	nvidiaDevInstDone = true
	const root = `SYSTEM\CurrentControlSet\Enum\PCI`
	k, models := subKeys(registry.LOCAL_MACHINE, root, registry.QUERY_VALUE)
	if k == 0 {
		return 0
	}
	k.Close()
	for _, model := range models {
		if !strings.HasPrefix(strings.ToUpper(model), "VEN_10DE") {
			continue
		}
		k2, instances := subKeys(registry.LOCAL_MACHINE, root+`\`+model, registry.QUERY_VALUE)
		if k2 == 0 {
			continue
		}
		k2.Close()
		for _, inst := range instances {
			// ClassGUID plutôt que « Class » : cette valeur est vide dans la clé du périphérique.
			if !strings.EqualFold(readString(registry.LOCAL_MACHINE, root+`\`+model+`\`+inst, "ClassGUID"), "{4d36e968-e325-11ce-bfc1-08002be10318}") {
				continue
			}
			id, err := windows.UTF16PtrFromString(`PCI\` + model + `\` + inst)
			if err != nil {
				continue
			}
			var devInst uint32
			if r, _, _ := procLocateDevNode.Call(uintptr(unsafe.Pointer(&devInst)), uintptr(unsafe.Pointer(id)), 0); r == 0 {
				nvidiaDevInst = devInst
				return devInst
			}
		}
	}
	return 0
}

// GPUPowerState renvoie « D0 »…« D3 » pour la carte NVIDIA, ou « » si elle est introuvable ou illisible.
func GPUPowerState() string {
	inst := findNvidiaDevInst()
	if inst == 0 {
		return ""
	}
	var data cmPowerData
	buf := make([]byte, 256)
	size := uint32(len(buf))
	r, _, _ := procGetDevNodeRegProperty.Call(uintptr(inst), cmDrpDevicePowerData, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)), 0)
	if r != 0 || size < uint32(unsafe.Sizeof(data)) {
		return ""
	}
	data = *(*cmPowerData)(unsafe.Pointer(&buf[0]))
	switch data.MostRecentState {
	case 1:
		return "D0"
	case 2:
		return "D1"
	case 3:
		return "D2"
	case 4:
		return "D3"
	}
	return ""
}

// graphicsMode déduit le mode graphique du portable des cartes PRÉSENTES dans Windows : « hybrid » (carte intégrée et
// carte NVIDIA, commutation Optimus), « discrete » (NVIDIA seule : mode « dédié » du BIOS) ou « integrated » (carte
// NVIDIA désactivée). C'est une déduction, pas une lecture du réglage ASUS. Le résultat est mis en cache : l'ensemble
// des cartes ne change pas en cours d'exécution (un changement de mode exige un redémarrage).
var graphicsModeCache struct {
	done       bool
	mode       string
	integrated *IntegratedGPU
}

// IntegratedGPU est la puce graphique intégrée au processeur (Intel, AMD), qui prend le relais quand la carte NVIDIA dort.
// Seuls son nom et sa version de pilote sont connus : la mesurer demanderait des compteurs lourds, sans intérêt ici.
type IntegratedGPU struct {
	Name   string `json:"name"`
	Driver string `json:"driver,omitempty"`
}

// Integrated renvoie la puce graphique intégrée présente, ou nil (carte NVIDIA seule, ou lecture impossible).
func Integrated() *IntegratedGPU {
	graphicsMode()
	return graphicsModeCache.integrated
}

func graphicsMode() string {
	if graphicsModeCache.done {
		return graphicsModeCache.mode
	}
	graphicsModeCache.done = true
	const root = `SYSTEM\CurrentControlSet\Enum\PCI`
	k, models := subKeys(registry.LOCAL_MACHINE, root, registry.QUERY_VALUE)
	if k == 0 {
		return ""
	}
	k.Close()
	var nvidia, other bool
	for _, model := range models {
		upper := strings.ToUpper(model)
		isNvidia := strings.HasPrefix(upper, "VEN_10DE")
		if !isNvidia && !strings.HasPrefix(upper, "VEN_8086") && !strings.HasPrefix(upper, "VEN_1002") {
			continue
		}
		k2, instances := subKeys(registry.LOCAL_MACHINE, root+`\`+model, registry.QUERY_VALUE)
		if k2 == 0 {
			continue
		}
		k2.Close()
		for _, inst := range instances {
			if !strings.EqualFold(readString(registry.LOCAL_MACHINE, root+`\`+model+`\`+inst, "ClassGUID"), "{4d36e968-e325-11ce-bfc1-08002be10318}") {
				continue
			}
			id, err := windows.UTF16PtrFromString(`PCI\` + model + `\` + inst)
			if err != nil {
				continue
			}
			// Flag 0 = périphériques présents seulement : le registre garde aussi les cartes retirées ou désactivées.
			var devInst uint32
			if r, _, _ := procLocateDevNode.Call(uintptr(unsafe.Pointer(&devInst)), uintptr(unsafe.Pointer(id)), 0); r != 0 {
				continue
			}
			if isNvidia {
				nvidia = true
			} else {
				other = true
				// Le nom propre et la version du pilote sont dans la clé de classe que l'instance référence (« Driver »).
				if drv := readString(registry.LOCAL_MACHINE, root+`\`+model+`\`+inst, "Driver"); drv != "" && graphicsModeCache.integrated == nil {
					classKey := `SYSTEM\CurrentControlSet\Control\Class\` + drv
					if name := readString(registry.LOCAL_MACHINE, classKey, "DriverDesc"); name != "" {
						graphicsModeCache.integrated = &IntegratedGPU{Name: name, Driver: readString(registry.LOCAL_MACHINE, classKey, "DriverVersion")}
					}
				}
			}
		}
	}
	switch {
	case nvidia && other:
		graphicsModeCache.mode = "hybrid"
	case nvidia:
		graphicsModeCache.mode = "discrete"
	case other:
		graphicsModeCache.mode = "integrated"
	}
	return graphicsModeCache.mode
}
