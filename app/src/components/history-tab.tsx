import { useCallback, useMemo, useState } from "react"
import { BatteryMedium, Fan, History as HistoryIcon, Sun } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api, type BatteryDetails, type DaySummary, type Fouling, type HistorySample } from "@/lib/api"
import { cn } from "@/lib/utils"

/** L'historique change peu : une relecture toutes les 30 s (la période d'enregistrement du contrôleur) suffit. */
const REFRESH_MS = 30_000

const RANGES: { key: string; hours: number }[] = [
  { key: "h1", hours: 1 },
  { key: "h6", hours: 6 },
  { key: "h24", hours: 24 },
  { key: "d7", hours: 24 * 7 },
  { key: "d14", hours: 24 * 14 },
]

const W = 600
const H = 160

/**
 * Séries affichables. Toutes sont ramenées à 0–100 pour partager un axe : températures en °C, charges et niveau de
 * batterie en %, RPM rapportés à 6000, puissances rapportées à 100 W (valeur absolue pour la batterie).
 */
interface Series {
  id: string
  color: string
  pick: (s: HistorySample) => number | undefined
  max: number
  on: boolean
}

const SERIES: Series[] = [
  { id: "temp", color: "#d6a35c", pick: (s) => s.temp, max: 100, on: true },
  { id: "gpuT", color: "#c0775a", pick: (s) => s.gpu_t, max: 100, on: false },
  { id: "pct", color: "#7aa6d6", pick: (s) => s.pct, max: 100, on: true },
  { id: "rpm", color: "#d6d6d6", pick: (s) => s.rpm, max: 6000, on: false },
  { id: "cpu", color: "#8b9bb4", pick: (s) => s.cpu, max: 100, on: false },
  { id: "gpuU", color: "#7aa58a", pick: (s) => s.gpu_u, max: 100, on: false },
  { id: "gpuW", color: "#a58ac0", pick: (s) => s.gpu_w, max: 100, on: false },
  { id: "bat", color: "#7ac0b8", pick: (s) => s.bat, max: 100, on: false },
  { id: "batW", color: "#c0b07a", pick: (s) => (s.bat_w !== undefined ? Math.abs(s.bat_w) : undefined), max: 100, on: false },
]

/** Tracé d'une série : une interruption (plus de 3 fois le pas médian) coupe la ligne au lieu de relier deux périodes sans lien. */
function buildPath(samples: HistorySample[], pick: Series["pick"], max: number, t0: number, span: number, gap: number): string {
  let d = ""
  let prevT = -Infinity
  for (const s of samples) {
    const v = pick(s)
    if (v === undefined) {
      prevT = -Infinity
      continue
    }
    const x = ((s.t - t0) / span) * W
    const y = H - (Math.min(v, max) / max) * H
    d += `${s.t - prevT > gap ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `
    prevT = s.t
  }
  return d
}

/** Heure ou date selon la durée affichée. */
function formatTime(t: number, hours: number, locale: string): string {
  const date = new Date(t * 1000)
  return hours <= 24
    ? date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function Timeline({ samples, hours, enabled }: { samples: HistorySample[]; hours: number; enabled: Set<string> }) {
  const { i18n } = useTranslation()
  const t0 = samples[0]?.t ?? 0
  const span = Math.max(1, (samples[samples.length - 1]?.t ?? 0) - t0)
  const gap = useMemo(() => {
    const diffs = samples.slice(1).map((s, i) => s.t - samples[i].t).sort((a, b) => a - b)
    return (diffs[Math.floor(diffs.length / 2)] ?? 30) * 3
  }, [samples])
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible">
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1="0" x2={W} y1={H * r} y2={H * r} stroke="var(--border)" strokeDasharray="3 5" />
        ))}
        {SERIES.filter((s) => enabled.has(s.id)).map((s) => (
          <path key={s.id} d={buildPath(samples, s.pick, s.max, t0, span, gap)} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-muted-foreground">
        <span>{formatTime(t0, hours, i18n.language)}</span>
        <span>{formatTime(t0 + span, hours, i18n.language)}</span>
      </div>
    </div>
  )
}

function FoulingCard({ fouling }: { fouling: Fouling | null }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Fan className="size-4 text-muted-foreground" /> {t("history.fouling.title")}
        </CardTitle>
        <CardDescription>{t("history.fouling.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!fouling ? (
          <p className="text-muted-foreground">{t("history.fouling.reading")}</p>
        ) : (
          <>
            <p>{t(`history.fouling.${fouling.status}`)}</p>
            <p className="text-muted-foreground">
              {t("history.fouling.coverage", { count: fouling.days_covered >= 2 ? 2 : 1, days: fouling.days_covered.toFixed(1) })}
              {fouling.status !== "insufficient" &&
                t("history.fouling.gap", {
                  count: fouling.buckets,
                  sign: fouling.drop_percent >= 0 ? "-" : "+",
                  drop: Math.abs(fouling.drop_percent).toFixed(1),
                })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BatteryCard({ details }: { details?: BatteryDetails }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <BatteryMedium className="size-4 text-muted-foreground" /> {t("history.battery.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!details || details.designed_mwh === 0 ? (
          <p className="text-muted-foreground">{t("history.battery.unavailable")}</p>
        ) : (
          <>
            <p>
              <Trans
                i18nKey="history.battery.capacity"
                values={{
                  full: (details.full_charged_mwh / 1000).toFixed(1),
                  design: (details.designed_mwh / 1000).toFixed(1),
                  health: Math.round(100 - details.wear_percent),
                }}
                components={{ mono: <span className="font-mono" /> }}
              />
            </p>
            <p className="text-muted-foreground">
              {details.cycle_count > 0 ? t("history.battery.cycles", { count: details.cycle_count }) : ""}
              {details.chemistry ? t("history.battery.chemistry", { value: details.chemistry }) : ""}
              {details.voltage_mv > 0 ? `${(details.voltage_mv / 1000).toFixed(2)} V` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

/** « 2 h 05 » ou « 45 min ». */
function duration(min: number, t: TFunction): string {
  return min >= 60 ? t("history.day.hm", { h: Math.floor(min / 60), m: String(min % 60).padStart(2, "0") }) : t("history.day.m", { m: min })
}

/** Résumé des dernières 24 heures : température, charge, batterie. */
function DayCard({ day }: { day: DaySummary | null }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Sun className="size-4 text-muted-foreground" /> {t("history.day.title")}
        </CardTitle>
        <CardDescription>
          {day && day.samples > 0 ? t("history.day.covered", { hours: day.covered_hours.toFixed(1) }) : t("history.day.fromHistory")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!day || day.samples === 0 ? (
          <p className="text-muted-foreground">{t("history.day.none")}</p>
        ) : (
          <>
            <Stat label={t("history.day.cpuTemp")} value={t("history.day.cpuTempValue", { avg: day.avg_temp_c.toFixed(0), max: day.max_temp_c })} />
            <Stat label={t("history.day.above70")} value={duration(day.minutes_above_70, t)} />
            <Stat label={t("history.day.highLoad")} value={day.minutes_high_load > 0 ? duration(day.minutes_high_load, t) : "—"} />
            {day.max_gpu_temp_c > 0 && <Stat label={t("history.day.gpuMax")} value={`${day.max_gpu_temp_c}°`} />}
            <Stat label={t("history.day.onBattery")} value={day.minutes_on_battery > 0 ? duration(day.minutes_on_battery, t) : "—"} />
            {day.battery_used_wh > 0 && <Stat label={t("history.day.used")} value={`${day.battery_used_wh.toFixed(1)} Wh`} />}
            {day.battery_charged_wh > 0 && <Stat label={t("history.day.charged")} value={`${day.battery_charged_wh.toFixed(1)} Wh`} />}
            <p className="text-muted-foreground">{t("history.day.note")}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Historique long : courbes sur plusieurs jours, diagnostic d'encrassement et santé de la batterie. */
export function HistoryTab({ batteryDetails }: { batteryDetails?: BatteryDetails }) {
  const { t } = useTranslation()
  const [hours, setHours] = useState(24)
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(SERIES.filter((s) => s.on).map((s) => s.id)))
  const fetchSamples = useCallback(() => api.history(hours), [hours])
  const samples = usePolled(fetchSamples, REFRESH_MS)
  const fouling = usePolled(api.fouling, REFRESH_MS * 10)
  const day = usePolled(api.summary, REFRESH_MS * 2)

  const available = SERIES.filter((s) => samples?.some((p) => s.pick(p) !== undefined))
  const toggle = (id: string) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const temps = samples?.map((s) => s.temp).filter((t): t is number => !!t) ?? []
  const stat = temps.length ? { min: Math.min(...temps), max: Math.max(...temps), avg: temps.reduce((a, b) => a + b, 0) / temps.length } : null

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xs">
              <HistoryIcon className="size-4 text-muted-foreground" /> {t("history.title")}
            </CardTitle>
            <CardDescription>{t("history.subtitle")}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {RANGES.map((r) => (
              <Button key={r.hours} size="sm" variant={hours === r.hours ? "default" : "outline"} onClick={() => setHours(r.hours)}>
                {t(`history.ranges.${r.key}`)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!samples ? (
            <p className="text-muted-foreground">{t("history.loading")}</p>
          ) : samples.length < 2 ? (
            <p className="text-muted-foreground">{t("history.empty")}</p>
          ) : (
            <>
              <Timeline samples={samples} hours={hours} enabled={enabled} />
              <div className="flex flex-wrap gap-2">
                {available.map((s) => {
                  const isOn = enabled.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      aria-pressed={isOn}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 ring-border transition-colors",
                        isOn ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground",
                      )}
                    >
                      <i className="inline-block h-0.5 w-4" style={{ background: s.color, opacity: isOn ? 1 : 0.35 }} />
                      {t(`history.series.${s.id}`)}
                    </button>
                  )
                })}
              </div>
              {stat && (
                <p className="text-muted-foreground">{t("history.tempStats", { min: stat.min, avg: stat.avg.toFixed(0), max: stat.max })}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <DayCard day={day} />

      <div className="grid grid-cols-2 gap-4">
        <FoulingCard fouling={fouling} />
        <BatteryCard details={batteryDetails} />
      </div>
    </div>
  )
}
