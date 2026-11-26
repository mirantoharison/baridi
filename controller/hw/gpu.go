package hw

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// GPU est l'état de la carte graphique NVIDIA à un instant donné.
type GPU struct {
	Name         string  `json:"name"`
	TempC        int     `json:"temp_c"`
	UsagePercent int     `json:"usage_percent"`
	MemUsedMB    int     `json:"mem_used_mb"`
	MemTotalMB   int     `json:"mem_total_mb"`
	PowerW       float64 `json:"power_w"`
	ClockMHz     int     `json:"clock_mhz"`
	MemClockMHz  int     `json:"mem_clock_mhz"`
	// PowerLimitW : plafond de puissance appliqué par le pilote (0 = non communiqué).
	PowerLimitW float64 `json:"power_limit_w,omitempty"`
	// FanPercent : vitesse du ventilateur PROPRE de la carte, si le modèle l'expose (rare sur portable : absent sinon).
	FanPercent *int `json:"fan_percent,omitempty"`
	// PState : état de performance, 0 (maximum) à 15 (repos) ; -1 si inconnu.
	PState    int    `json:"pstate"`
	PCIeGen   int    `json:"pcie_gen,omitempty"`
	PCIeWidth int    `json:"pcie_width,omitempty"`
	Driver    string `json:"driver,omitempty"`
	// Throttle : raisons du ralentissement en cours — « hw_thermal », « sw_thermal », « power » ou « hw_slowdown ». Vide si aucune.
	Throttle []string `json:"throttle,omitempty"`
	// PowerState : état d'alimentation Windows de la carte (« D0 » allumée … « D3 » veille profonde), vide si illisible.
	// Asleep : la carte dort — AUCUNE mesure NVML n'a été faite (la demander la réveillerait), les champs sont vides.
	PowerState string `json:"power_state,omitempty"`
	Asleep     bool   `json:"asleep,omitempty"`
	// Mode : « hybrid », « discrete » ou « integrated », déduit des cartes présentes (voir graphicsMode).
	Mode string `json:"mode,omitempty"`
	// Integrated : la puce graphique intégrée, quand la machine est hybride (elle affiche l'écran pendant que la NVIDIA dort).
	Integrated *IntegratedGPU `json:"integrated,omitempty"`
	// Processes : programmes qui utilisent la carte en ce moment (au plus quelques-uns), quand le pilote les indique.
	Processes []string `json:"processes,omitempty"`
}

// NVML : bibliothèque de gestion officielle de NVIDIA, installée avec le pilote dans System32. Toutes ses fonctions
// renvoient un code, 0 = succès. On l'appelle par syscall : aucune dépendance supplémentaire, aucun processus lancé
// (contrairement à nvidia-smi.exe).
var (
	nvml                    = windows.NewLazySystemDLL("nvml.dll")
	nvmlInit                = nvml.NewProc("nvmlInit_v2")
	nvmlHandleByIndex       = nvml.NewProc("nvmlDeviceGetHandleByIndex_v2")
	nvmlGetName             = nvml.NewProc("nvmlDeviceGetName")
	nvmlGetTemperature      = nvml.NewProc("nvmlDeviceGetTemperature")
	nvmlGetGraphicsProcs    = nvml.NewProc("nvmlDeviceGetGraphicsRunningProcesses")
	nvmlGetUtilizationRates = nvml.NewProc("nvmlDeviceGetUtilizationRates")
	nvmlGetMemoryInfo       = nvml.NewProc("nvmlDeviceGetMemoryInfo")
	nvmlGetPowerUsage       = nvml.NewProc("nvmlDeviceGetPowerUsage")
	nvmlGetClockInfo        = nvml.NewProc("nvmlDeviceGetClockInfo")
	nvmlGetPowerLimit       = nvml.NewProc("nvmlDeviceGetEnforcedPowerLimit")
	nvmlGetFanSpeed         = nvml.NewProc("nvmlDeviceGetFanSpeed")
	nvmlGetPState           = nvml.NewProc("nvmlDeviceGetPerformanceState")
	nvmlGetPCIeGen          = nvml.NewProc("nvmlDeviceGetCurrPcieLinkGeneration")
	nvmlGetPCIeWidth        = nvml.NewProc("nvmlDeviceGetCurrPcieLinkWidth")
	nvmlGetThrottleReasons  = nvml.NewProc("nvmlDeviceGetCurrentClocksThrottleReasons")
	nvmlGetDriverVersion    = nvml.NewProc("nvmlSystemGetDriverVersion")
)

// Bits de nvmlDeviceGetCurrentClocksThrottleReasons regroupés en trois familles lisibles. Les autres (GPU au repos,
// horloges fixées par l'application, réglage d'affichage) sont normales et ne signalent aucun problème.
const (
	throttleSwPowerCap   = 0x04
	throttleHwSlowdown   = 0x08
	throttleSwThermal    = 0x20
	throttleHwThermal    = 0x40
	throttleHwPowerBrake = 0x80
	// nvmlDriverBufferSize : taille du tampon de la version du pilote (NVML_SYSTEM_DRIVER_VERSION_BUFFER_SIZE).
	nvmlDriverBufferSize = 80
	// nvmlPStateUnknown : valeur renvoyée par NVML quand l'état de performance est inconnu.
	nvmlPStateUnknown = 32
)

// cString convertit un tampon C (terminé par un octet nul) en chaîne.
func cString(buf []byte) string {
	n := 0
	for n < len(buf) && buf[n] != 0 {
		n++
	}
	return string(buf[:n])
}

// throttleFamilies traduit les bits de limitation en familles lisibles (voir GPU.Throttle).
//
// IMPORTANT : le thermique LOGICIEL (0x20) et le thermique MATÉRIEL (0x40) sont séparés. Sur le portable de développement,
// le pilote renvoie 0x20 en permanence, y compris à 50 °C : c'est le plafond thermique imposé par la plateforme, pas une
// surchauffe. Seul 0x40 (« hw_thermal ») signale que la puce elle-même se protège ; l'interface ne doit alerter que sur lui.
func throttleFamilies(bits uint64) []string {
	var out []string
	if bits&throttleHwThermal != 0 {
		out = append(out, "hw_thermal")
	}
	if bits&throttleSwThermal != 0 {
		out = append(out, "sw_thermal")
	}
	if bits&(throttleSwPowerCap|throttleHwPowerBrake) != 0 {
		out = append(out, "power")
	}
	if bits&throttleHwSlowdown != 0 {
		out = append(out, "hw_slowdown")
	}
	return out
}

const (
	nvmlTemperatureGPU = 0
	nvmlClockGraphics  = 0
	nvmlClockMem       = 2
	// nvmlNameBufferSize : taille du tampon du nom (NVML_DEVICE_NAME_V2_BUFFER_SIZE).
	nvmlNameBufferSize = 96
	bytesPerMB         = 1024 * 1024
)

type nvmlUtilization struct{ GPU, Memory uint32 }
type nvmlMemory struct{ Total, Free, Used uint64 }

// gpuSampler garde le handle NVML du premier GPU NVIDIA.
type gpuSampler struct {
	handle uintptr
	name   string
	driver string
}

// newGPUSampler initialise NVML. Renvoie nil si le pilote NVIDIA est absent (machine sans carte NVIDIA, pilote non
// installé) : l'interface n'affiche alors simplement pas de carte GPU.
func newGPUSampler() *gpuSampler {
	if err := nvml.Load(); err != nil {
		return nil
	}
	if r, _, _ := nvmlInit.Call(); r != 0 {
		return nil
	}
	var handle uintptr
	if r, _, _ := nvmlHandleByIndex.Call(0, uintptr(unsafe.Pointer(&handle))); r != 0 {
		return nil
	}
	g := &gpuSampler{handle: handle}
	buf := make([]byte, nvmlNameBufferSize)
	if r, _, _ := nvmlGetName.Call(handle, uintptr(unsafe.Pointer(&buf[0])), nvmlNameBufferSize); r == 0 {
		g.name = cString(buf)
	}
	// La version du pilote ne change pas en cours de route : lue une fois.
	drv := make([]byte, nvmlDriverBufferSize)
	if r, _, _ := nvmlGetDriverVersion.Call(uintptr(unsafe.Pointer(&drv[0])), nvmlDriverBufferSize); r == 0 {
		g.driver = cString(drv)
	}
	return g
}

// Sample mesure la carte. Une valeur que NVML refuse de donner reste à zéro plutôt que de faire échouer tout l'état :
// certains champs (puissance, horloges) manquent sur certains modèles ou pilotes.
func (g *gpuSampler) Sample() GPU {
	out := GPU{Name: g.name}

	var temp uint32
	if r, _, _ := nvmlGetTemperature.Call(g.handle, nvmlTemperatureGPU, uintptr(unsafe.Pointer(&temp))); r == 0 {
		out.TempC = int(temp)
	}
	var util nvmlUtilization
	if r, _, _ := nvmlGetUtilizationRates.Call(g.handle, uintptr(unsafe.Pointer(&util))); r == 0 {
		out.UsagePercent = int(util.GPU)
	}
	var mem nvmlMemory
	if r, _, _ := nvmlGetMemoryInfo.Call(g.handle, uintptr(unsafe.Pointer(&mem))); r == 0 {
		out.MemUsedMB = int(mem.Used / bytesPerMB)
		out.MemTotalMB = int(mem.Total / bytesPerMB)
	}
	var milliwatts uint32
	if r, _, _ := nvmlGetPowerUsage.Call(g.handle, uintptr(unsafe.Pointer(&milliwatts))); r == 0 {
		out.PowerW = float64(milliwatts) / 1000
	}
	var mhz uint32
	if r, _, _ := nvmlGetClockInfo.Call(g.handle, nvmlClockGraphics, uintptr(unsafe.Pointer(&mhz))); r == 0 {
		out.ClockMHz = int(mhz)
	}
	if r, _, _ := nvmlGetClockInfo.Call(g.handle, nvmlClockMem, uintptr(unsafe.Pointer(&mhz))); r == 0 {
		out.MemClockMHz = int(mhz)
	}

	out.Driver = g.driver
	out.Processes = g.processes()
	out.PState = -1
	var limit uint32
	if r, _, _ := nvmlGetPowerLimit.Call(g.handle, uintptr(unsafe.Pointer(&limit))); r == 0 {
		out.PowerLimitW = float64(limit) / 1000
	}
	// Ventilateur propre de la carte : le plus souvent « non pris en charge » sur un portable, le champ reste alors absent.
	var fanPct uint32
	if r, _, _ := nvmlGetFanSpeed.Call(g.handle, uintptr(unsafe.Pointer(&fanPct))); r == 0 {
		v := int(fanPct)
		out.FanPercent = &v
	}
	var pstate uint32
	if r, _, _ := nvmlGetPState.Call(g.handle, uintptr(unsafe.Pointer(&pstate))); r == 0 && pstate != nvmlPStateUnknown {
		out.PState = int(pstate)
	}
	var gen, width uint32
	if r, _, _ := nvmlGetPCIeGen.Call(g.handle, uintptr(unsafe.Pointer(&gen))); r == 0 {
		out.PCIeGen = int(gen)
	}
	if r, _, _ := nvmlGetPCIeWidth.Call(g.handle, uintptr(unsafe.Pointer(&width))); r == 0 {
		out.PCIeWidth = int(width)
	}
	var reasons uint64
	if r, _, _ := nvmlGetThrottleReasons.Call(g.handle, uintptr(unsafe.Pointer(&reasons))); r == 0 {
		out.Throttle = throttleFamilies(reasons)
	}
	return out
}

// Temp lit uniquement la température (un seul appel NVML) : pour la courbe de ventilation, qui n'a pas besoin du reste.
func (g *gpuSampler) Temp() int {
	var temp uint32
	if r, _, _ := nvmlGetTemperature.Call(g.handle, nvmlTemperatureGPU, uintptr(unsafe.Pointer(&temp))); r == 0 {
		return int(temp)
	}
	return 0
}

// nvmlProcessInfo : début de nvmlProcessInfo_t (pid, mémoire utilisée) ; le pilote remplit la forme historique.
type nvmlProcessInfo struct {
	PID           uint32
	_             uint32
	UsedGPUMemory uint64
}

const maxGPUProcesses = 5

// processes renvoie les noms des programmes qui dessinent sur la carte. Sous Windows le pilote ne les liste pas toujours :
// une liste vide ne veut pas dire que la carte est inutilisée.
func (g *gpuSampler) processes() []string {
	var count uint32 = 32
	buf := make([]nvmlProcessInfo, count)
	if r, _, _ := nvmlGetGraphicsProcs.Call(g.handle, uintptr(unsafe.Pointer(&count)), uintptr(unsafe.Pointer(&buf[0]))); r != 0 || count == 0 {
		return nil
	}
	names := pidNames()
	seen := map[string]bool{}
	var out []string
	for _, p := range buf[:min(int(count), len(buf))] {
		if n := names[p.PID]; n != "" && !seen[n] {
			seen[n] = true
			out = append(out, n)
			if len(out) == maxGPUProcesses {
				break
			}
		}
	}
	return out
}
