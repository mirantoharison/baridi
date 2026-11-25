import { BatteryCharging, BatteryFull, Cpu, MemoryStick, MonitorCog, Thermometer } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BatteryDetails, BatteryStatus, CpuStatus, ExtraSensors, GpuStatus, RamStatus } from "@/lib/api"
import { tempColor } from "@/lib/thermal"
import { cn } from "@/lib/utils"

/** Ligne de mesure : libellé, valeur et, si on connaît un pourcentage, une jauge fine. */
function Meter({ label, value, percent }: { label: string; value: string; percent?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold tabular-nums">{value}</span>
      </div>
      {percent !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-none bg-muted" role="presentation">
          <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      )}
    </div>
  )
}

/** Valeur secondaire sans jauge (fréquence, puissance, horloges) : libellé à gauche, valeur à droite. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

/** Pastille d'état. « alert » = problème réel ; « info » = renseignement neutre qui ne doit pas inquiéter. */
function Chip({ tone, children, title }: { tone: "alert" | "info"; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
        tone === "alert" ? "bg-rose-500/10 text-rose-600 ring-rose-500/40 dark:text-rose-400" : "bg-muted/60 text-muted-foreground ring-border",
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone === "alert" ? "bg-rose-500" : "bg-muted-foreground/60")} />
      {children}
    </span>
  )
}

const ghz = (mhz: number) => `${(mhz / 1000).toFixed(2)} GHz`

/** Petites barres verticales, une par thread logique : repère d'un coup d'œil un cœur saturé. */
function CoreBars({ cores, freqs }: { cores: number[]; freqs?: number[] }) {
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground">Charge par thread</span>
      <div className="flex h-12 items-end gap-1" role="img" aria-label={`Charge de ${cores.length} threads : ${cores.join(", ")} %`}>
        {cores.map((pct, i) => (
          <div key={i} className="flex h-full flex-1 items-end bg-muted" title={`Thread ${i + 1} : ${pct} %${freqs?.[i] ? ` · ${(freqs[i] / 1000).toFixed(2)} GHz` : ""}`}>
            <div className="w-full bg-primary transition-[height] duration-500" style={{ height: `${Math.max(pct, 2)}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Carte du processeur : charge, fréquence, limitation éventuelle et charge par thread. */
export function CpuCard({ cpu }: { cpu: CpuStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Cpu className="size-4 text-muted-foreground" /> Processeur
        </CardTitle>
        <p className="truncate text-muted-foreground" title={cpu.name}>{cpu.name}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Meter label="Charge" value={`${Math.round(cpu.usage_percent)} %`} percent={cpu.usage_percent} />
        <Row label="Fréquence" value={ghz(cpu.freq_mhz)} />
        <Row label="Fréquence de base" value={ghz(cpu.base_mhz)} />
        {cpu.throttled && (
          <div>
            <Chip tone="alert" title="La fréquence est nettement sous la fréquence de base alors que le processeur est chargé : déduction, pas une lecture directe d'un indicateur matériel.">
              Limitation probable
            </Chip>
          </div>
        )}
        {cpu.core_freq_mhz && cpu.core_freq_mhz.length > 0 && (
          <Row label="Fréquence du thread le plus rapide" value={ghz(Math.max(...cpu.core_freq_mhz))} />
        )}
        {cpu.cores && cpu.cores.length > 0 && <CoreBars cores={cpu.cores} freqs={cpu.core_freq_mhz} />}
      </CardContent>
    </Card>
  )
}

/** Libellés des raisons de ralentissement de la GPU, et leur gravité (voir GpuStatus.throttle). */
const THROTTLE_LABELS: Record<string, { label: string; tone: "alert" | "info"; hint: string }> = {
  hw_thermal: { label: "Protection thermique", tone: "alert", hint: "La puce se bride elle-même pour se protéger de la chaleur." },
  hw_slowdown: { label: "Ralentissement matériel", tone: "alert", hint: "Le matériel impose un ralentissement (alimentation, température ou protection)." },
  power: { label: "Limite de puissance", tone: "info", hint: "La consommation atteint le plafond autorisé : normal en charge soutenue." },
  sw_thermal: {
    label: "Plafond thermique plateforme",
    tone: "info",
    hint: "Plafond thermique géré par le portable. Les portables le déclarent en permanence, même à froid : ce n'est pas une surchauffe.",
  },
}

/** Libellés du mode graphique. Déduit des cartes présentes : changer de mode se fait dans le BIOS ou Armoury Crate, et demande un redémarrage. */
const GRAPHICS_MODES: Record<NonNullable<GpuStatus["mode"]>, string> = {
  hybrid: "Hybride (carte intégrée + NVIDIA)",
  discrete: "Dédié (NVIDIA seule)",
  integrated: "Intégré (NVIDIA désactivée)",
}

/** Carte de la carte graphique : température, charge, mémoire, consommation, horloges, état et raisons de limitation. */
export function GpuCard({ gpu }: { gpu: GpuStatus }) {
  const memPercent = gpu.mem_total_mb > 0 ? (100 * gpu.mem_used_mb) / gpu.mem_total_mb : 0
  const throttles = (gpu.throttle ?? []).map((t) => THROTTLE_LABELS[t]).filter(Boolean)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <MonitorCog className="size-4 text-muted-foreground" /> Carte graphique
        </CardTitle>
        <p className="truncate text-muted-foreground" title={gpu.name}>{gpu.name}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {gpu.mode && <Row label="Mode graphique" value={GRAPHICS_MODES[gpu.mode]} />}
        {gpu.asleep && (
          <>
            <div>
              <Chip tone="info" title="La carte est en veille profonde (D3). L'application ne l'interroge pas : cela la réveillerait et vide la batterie pour rien.">
                En veille
              </Chip>
            </div>
            <p className="text-muted-foreground">
              La carte dort, donc aucune mesure : l'application ne la réveille jamais. Elle se réveillera d'elle-même quand un programme en aura besoin, et ses mesures apparaîtront ici.
            </p>
          </>
        )}
        {!gpu.asleep && (<>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">Température</span>
          <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: tempColor(gpu.temp_c) }}>
            {gpu.temp_c}°C
          </span>
        </div>
        <Meter label="Charge" value={`${gpu.usage_percent} %`} percent={gpu.usage_percent} />
        <Meter label="Mémoire" value={`${gpu.mem_used_mb} / ${gpu.mem_total_mb} Mo`} percent={memPercent} />
        {gpu.power_w > 0 && (
          <Row label="Consommation" value={gpu.power_limit_w ? `${gpu.power_w.toFixed(1)} / ${Math.round(gpu.power_limit_w)} W` : `${gpu.power_w.toFixed(1)} W`} />
        )}
        {gpu.clock_mhz > 0 && <Row label="Horloge" value={`${gpu.clock_mhz} MHz`} />}
        {gpu.mem_clock_mhz > 0 && <Row label="Horloge mémoire" value={`${gpu.mem_clock_mhz} MHz`} />}
        {gpu.pstate >= 0 && <Row label="État de performance" value={`P${gpu.pstate}`} />}
        {gpu.pcie_gen ? <Row label="Bus PCIe" value={`Gen ${gpu.pcie_gen} ×${gpu.pcie_width ?? "?"}`} /> : null}
        {gpu.fan_percent !== undefined && <Row label="Ventilateur de la carte" value={`${gpu.fan_percent} %`} />}
        {gpu.driver && <Row label="Pilote" value={gpu.driver} />}
        {gpu.processes && gpu.processes.length > 0 && <Row label="Utilisée par" value={gpu.processes.join(", ")} />}
        {throttles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {throttles.map((t) => (
              <Chip key={t.label} tone={t.tone} title={t.hint}>
                {t.label}
              </Chip>
            ))}
          </div>
        )}
        </>)}
      </CardContent>
    </Card>
  )
}

/** Durée d'autonomie lisible : « 2 h 35 » ou « 48 min ». */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`
}

const wh = (mwh: number) => `${(mwh / 1000).toFixed(1)} Wh`

/** Santé et consommation de la batterie : usure, cycles, tension et puissance instantanée. */
function BatteryHealthRows({ details }: { details: BatteryDetails }) {
  const wear = details.wear_percent
  return (
    <>
      {details.designed_mwh > 0 && details.full_charged_mwh > 0 && (
        <Row
          label="Santé"
          value={`${Math.round(100 - wear)} % (${wh(details.full_charged_mwh)} sur ${wh(details.designed_mwh)} d'origine)`}
        />
      )}
      {wear > 0 && <Row label="Usure" value={`${wear.toFixed(0)} %`} />}
      {details.cycle_count > 0 && <Row label="Cycles de charge" value={String(details.cycle_count)} />}
      {details.voltage_mv > 0 && <Row label="Tension" value={`${(details.voltage_mv / 1000).toFixed(2)} V`} />}
      {details.has_power && Math.abs(details.power_w) >= 0.1 && (
        <Row label={details.power_w > 0 ? "Charge" : "Consommation"} value={`${Math.abs(details.power_w).toFixed(1)} W`} />
      )}
    </>
  )
}

/** Mémoire vive et batterie, côte à côte dans une seule carte. */
export function MemoryBatteryCard({ ram, battery, details, etaMin }: { ram?: RamStatus; battery?: BatteryStatus; details?: BatteryDetails; etaMin?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <MemoryStick className="size-4 text-muted-foreground" /> Mémoire et batterie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ram && <Meter label="Mémoire vive" value={`${(ram.used_mb / 1024).toFixed(1)} / ${(ram.total_mb / 1024).toFixed(1)} Go`} percent={ram.usage_percent} />}
        {battery && (
          <>
            <Meter label="Batterie" value={`${battery.percent} %`} percent={battery.percent} />
            <div className="flex items-center gap-2 text-muted-foreground">
              {battery.charging ? <BatteryCharging className="size-4" /> : <BatteryFull className="size-4" />}
              <span>
                {battery.charging ? "En charge" : battery.plugged_in ? "Branchée, charge terminée" : "Sur batterie"}
                {etaMin !== undefined
                  ? ` · autonomie estimée ${formatMinutes(etaMin)} (consommation moyenne)`
                  : battery.minutes_left >= 0 && ` · autonomie estimée ${formatMinutes(battery.minutes_left)}`}
              </span>
            </div>
            {details && <BatteryHealthRows details={details} />}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Capteurs supplémentaires de la DLL ASUS. Les températures sont en °C. La puissance et la tension du processeur sont
 * affichées BRUTES, avec la mention de leur unité inconnue : on ne les convertit pas tant qu'elles ne sont pas étalonnées.
 */
export function SensorsCard({ sensors }: { sensors: ExtraSensors }) {
  const temps: [string, number | undefined][] = [
    ["Carte mère, gauche", sensors.board_left_c],
    ["Carte mère, droite", sensors.board_right_c],
    ["Autour de la GPU, gauche", sensors.gpu_left_c],
    ["Autour de la GPU, droite", sensors.gpu_right_c],
    ["Mémoire de la GPU", sensors.gpu_vram_c],
    ["Alimentation de la GPU", sensors.gpu_vrm_c],
    ["Haut du processeur", sensors.up_cpu_c],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Thermometer className="size-4 text-muted-foreground" /> Capteurs de la carte
        </CardTitle>
        <p className="text-muted-foreground">Lus par la bibliothèque ASUS, uniquement ceux que ce modèle gère.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {temps.map(
          ([label, v]) =>
            v !== undefined && (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold tabular-nums" style={{ color: tempColor(v) }}>
                  {v}°C
                </span>
              </div>
            ),
        )}
        {sensors.cpu_power_raw !== undefined && <Row label="Puissance du processeur (estimée)" value={`${(sensors.cpu_power_raw / 1000).toFixed(1)} W`} />}
        {sensors.cpu_voltage_raw !== undefined && <Row label="Tension du processeur (estimée)" value={`${(sensors.cpu_voltage_raw / 1000).toFixed(2)} V`} />}
        {sensors.pl1_raw !== undefined && <Row label="Limite de puissance PL1 (brute, unité inconnue)" value={String(sensors.pl1_raw)} />}
        {sensors.pl2_raw !== undefined && <Row label="Limite de puissance PL2 (brute, unité inconnue)" value={String(sensors.pl2_raw)} />}
        {(sensors.cpu_power_raw !== undefined || sensors.cpu_voltage_raw !== undefined) && (
          <p className="text-muted-foreground">Estimations : l'unité n'est pas documentée. Un test de charge sur 12 threads a donné environ 22 000 au plus fort et 2 000 à 8 000 au repos, soit 22 W et 2 à 8 W si ce sont des milliwatts ; la tension, de 0,69 à 0,80 V, est cohérente avec des millivolts.</p>
        )}
      </CardContent>
    </Card>
  )
}
