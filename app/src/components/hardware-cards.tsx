import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
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
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground">{t("hardware.cpu.loadPerThread")}</span>
      <div className="flex h-12 items-end gap-1" role="img" aria-label={t("hardware.cpu.loadAria", { count: cores.length, values: cores.join(", ") })}>
        {cores.map((pct, i) => (
          <div key={i} className="flex h-full flex-1 items-end bg-muted" title={`${t("hardware.cpu.threadTitle", { n: i + 1, pct })}${freqs?.[i] ? ` · ${(freqs[i] / 1000).toFixed(2)} GHz` : ""}`}>
            <div className="w-full bg-primary transition-[height] duration-500" style={{ height: `${Math.max(pct, 2)}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Carte du processeur : charge, fréquence, limitation éventuelle et charge par thread. */
export function CpuCard({ cpu }: { cpu: CpuStatus }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Cpu className="size-4 text-muted-foreground" /> {t("hardware.cpu.title")}
        </CardTitle>
        <p className="truncate text-muted-foreground" title={cpu.name}>{cpu.name}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Meter label={t("hardware.cpu.load")} value={`${Math.round(cpu.usage_percent)} %`} percent={cpu.usage_percent} />
        <Row label={t("hardware.cpu.freq")} value={ghz(cpu.freq_mhz)} />
        <Row label={t("hardware.cpu.baseFreq")} value={ghz(cpu.base_mhz)} />
        {cpu.throttled && (
          <div>
            <Chip tone="alert" title={t("hardware.cpu.throttledHint")}>
              {t("hardware.cpu.throttled")}
            </Chip>
          </div>
        )}
        {cpu.core_freq_mhz && cpu.core_freq_mhz.length > 0 && (
          <Row label={t("hardware.cpu.fastestThread")} value={ghz(Math.max(...cpu.core_freq_mhz))} />
        )}
        {cpu.cores && cpu.cores.length > 0 && <CoreBars cores={cpu.cores} freqs={cpu.core_freq_mhz} />}
      </CardContent>
    </Card>
  )
}

/** Gravité de chaque raison de ralentissement de la GPU (voir GpuStatus.throttle) ; le texte vient des traductions. */
const THROTTLE_TONES: Record<string, "alert" | "info"> = { hw_thermal: "alert", hw_slowdown: "alert", power: "info", sw_thermal: "info" }

/** Carte de la carte graphique : température, charge, mémoire, consommation, horloges, état et raisons de limitation. */
export function GpuCard({ gpu }: { gpu: GpuStatus }) {
  const { t } = useTranslation()
  const memPercent = gpu.mem_total_mb > 0 ? (100 * gpu.mem_used_mb) / gpu.mem_total_mb : 0
  const throttles = (gpu.throttle ?? []).filter((r) => r in THROTTLE_TONES)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <MonitorCog className="size-4 text-muted-foreground" /> {t("hardware.gpu.title")}
        </CardTitle>
        <p className="truncate text-muted-foreground" title={gpu.name}>{gpu.name}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {gpu.mode && <Row label={t("hardware.gpu.mode")} value={t(`hardware.gpu.modes.${gpu.mode}`)} />}
        {gpu.asleep && (
          <>
            <div>
              <Chip tone="info" title={t("hardware.gpu.asleepHint")}>
                {t("hardware.gpu.asleep")}
              </Chip>
            </div>
            <p className="text-muted-foreground">
              {t("hardware.gpu.asleepText")}
            </p>
          </>
        )}
        {!gpu.asleep && (<>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t("hardware.gpu.temperature")}</span>
          <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: tempColor(gpu.temp_c) }}>
            {gpu.temp_c}°C
          </span>
        </div>
        <Meter label={t("hardware.gpu.load")} value={`${gpu.usage_percent} %`} percent={gpu.usage_percent} />
        <Meter label={t("hardware.gpu.memory")} value={`${gpu.mem_used_mb} / ${gpu.mem_total_mb} ${t("hardware.units.mb")}`} percent={memPercent} />
        {gpu.power_w > 0 && (
          <Row label={t("hardware.gpu.power")} value={gpu.power_limit_w ? `${gpu.power_w.toFixed(1)} / ${Math.round(gpu.power_limit_w)} W` : `${gpu.power_w.toFixed(1)} W`} />
        )}
        {gpu.clock_mhz > 0 && <Row label={t("hardware.gpu.clock")} value={`${gpu.clock_mhz} MHz`} />}
        {gpu.mem_clock_mhz > 0 && <Row label={t("hardware.gpu.memClock")} value={`${gpu.mem_clock_mhz} MHz`} />}
        {gpu.pstate >= 0 && <Row label={t("hardware.gpu.pstate")} value={`P${gpu.pstate}`} />}
        {gpu.pcie_gen ? <Row label={t("hardware.gpu.pcie")} value={`Gen ${gpu.pcie_gen} ×${gpu.pcie_width ?? "?"}`} /> : null}
        {gpu.fan_percent !== undefined && <Row label={t("hardware.gpu.cardFan")} value={`${gpu.fan_percent} %`} />}
        {gpu.driver && <Row label={t("hardware.gpu.driver")} value={gpu.driver} />}
        {gpu.processes && gpu.processes.length > 0 && <Row label={t("hardware.gpu.usedBy")} value={gpu.processes.join(", ")} />}
        {throttles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {throttles.map((reason) => (
              <Chip key={reason} tone={THROTTLE_TONES[reason]} title={t(`hardware.gpu.throttle.${reason}.hint`)}>
                {t(`hardware.gpu.throttle.${reason}.label`)}
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
function formatMinutes(min: number, t: TFunction): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? t("hardware.battery.timeHm", { h, m: String(m).padStart(2, "0") }) : t("hardware.battery.timeM", { m })
}

const wh = (mwh: number) => `${(mwh / 1000).toFixed(1)} Wh`

/** Santé et consommation de la batterie : usure, cycles, tension et puissance instantanée. */
function BatteryHealthRows({ details }: { details: BatteryDetails }) {
  const { t } = useTranslation()
  const wear = details.wear_percent
  return (
    <>
      {details.designed_mwh > 0 && details.full_charged_mwh > 0 && (
        <Row
          label={t("hardware.battery.health")}
          value={t("hardware.battery.healthValue", { percent: Math.round(100 - wear), full: wh(details.full_charged_mwh), design: wh(details.designed_mwh) })}
        />
      )}
      {wear > 0 && <Row label={t("hardware.battery.wear")} value={`${wear.toFixed(0)} %`} />}
      {details.cycle_count > 0 && <Row label={t("hardware.battery.cycles")} value={String(details.cycle_count)} />}
      {details.voltage_mv > 0 && <Row label={t("hardware.battery.voltage")} value={`${(details.voltage_mv / 1000).toFixed(2)} V`} />}
      {details.has_power && Math.abs(details.power_w) >= 0.1 && (
        <Row label={details.power_w > 0 ? t("hardware.battery.charge") : t("hardware.battery.consumption")} value={`${Math.abs(details.power_w).toFixed(1)} W`} />
      )}
    </>
  )
}

/** Mémoire vive et batterie, côte à côte dans une seule carte. */
export function MemoryBatteryCard({ ram, battery, details, etaMin }: { ram?: RamStatus; battery?: BatteryStatus; details?: BatteryDetails; etaMin?: number }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <MemoryStick className="size-4 text-muted-foreground" /> {t("hardware.battery.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ram && <Meter label={t("hardware.battery.ram")} value={`${(ram.used_mb / 1024).toFixed(1)} / ${(ram.total_mb / 1024).toFixed(1)} ${t("hardware.units.gb")}`} percent={ram.usage_percent} />}
        {battery && (
          <>
            <Meter label={t("hardware.battery.level")} value={`${battery.percent} %`} percent={battery.percent} />
            <div className="flex items-center gap-2 text-muted-foreground">
              {battery.charging ? <BatteryCharging className="size-4" /> : <BatteryFull className="size-4" />}
              <span>
                {battery.charging ? t("hardware.battery.charging") : battery.plugged_in ? t("hardware.battery.full") : t("hardware.battery.onBattery")}
                {etaMin !== undefined
                  ? t("hardware.battery.etaAverage", { time: formatMinutes(etaMin, t) })
                  : battery.minutes_left >= 0 && t("hardware.battery.eta", { time: formatMinutes(battery.minutes_left, t) })}
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
  const { t } = useTranslation()
  const temps: [string, number | undefined][] = [
    [t("hardware.sensors.boardLeft"), sensors.board_left_c],
    [t("hardware.sensors.boardRight"), sensors.board_right_c],
    [t("hardware.sensors.gpuLeft"), sensors.gpu_left_c],
    [t("hardware.sensors.gpuRight"), sensors.gpu_right_c],
    [t("hardware.sensors.gpuVram"), sensors.gpu_vram_c],
    [t("hardware.sensors.gpuVrm"), sensors.gpu_vrm_c],
    [t("hardware.sensors.upCpu"), sensors.up_cpu_c],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Thermometer className="size-4 text-muted-foreground" /> {t("hardware.sensors.title")}
        </CardTitle>
        <p className="text-muted-foreground">{t("hardware.sensors.subtitle")}</p>
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
        {sensors.cpu_power_raw !== undefined && <Row label={t("hardware.sensors.cpuPower")} value={`${(sensors.cpu_power_raw / 1000).toFixed(1)} W`} />}
        {sensors.cpu_voltage_raw !== undefined && <Row label={t("hardware.sensors.cpuVoltage")} value={`${(sensors.cpu_voltage_raw / 1000).toFixed(2)} V`} />}
        {sensors.pl1_raw !== undefined && <Row label={t("hardware.sensors.pl1")} value={String(sensors.pl1_raw)} />}
        {sensors.pl2_raw !== undefined && <Row label={t("hardware.sensors.pl2")} value={String(sensors.pl2_raw)} />}
        {(sensors.cpu_power_raw !== undefined || sensors.cpu_voltage_raw !== undefined) && (
          <p className="text-muted-foreground">{t("hardware.sensors.note")}</p>
        )}
      </CardContent>
    </Card>
  )
}
