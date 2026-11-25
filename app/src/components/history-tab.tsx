import { useCallback, useMemo, useState } from "react"
import { BatteryMedium, Fan, History as HistoryIcon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api, type BatteryDetails, type DaySummary, type Fouling, type HistorySample } from "@/lib/api"
import { cn } from "@/lib/utils"

/** L'historique change peu : une relecture toutes les 30 s (la période d'enregistrement du contrôleur) suffit. */
const REFRESH_MS = 30_000

const RANGES: { label: string; hours: number }[] = [
  { label: "1 h", hours: 1 },
  { label: "6 h", hours: 6 },
  { label: "24 h", hours: 24 },
  { label: "7 jours", hours: 24 * 7 },
  { label: "14 jours", hours: 24 * 14 },
]

const W = 600
const H = 160

/**
 * Séries affichables. Toutes sont ramenées à 0–100 pour partager un axe : températures en °C, charges et niveau de
 * batterie en %, RPM rapportés à 6000, puissances rapportées à 100 W (valeur absolue pour la batterie).
 */
interface Series {
  id: string
  label: string
  color: string
  pick: (s: HistorySample) => number | undefined
  max: number
  on: boolean
}

const SERIES: Series[] = [
  { id: "temp", label: "Température CPU", color: "#d6a35c", pick: (s) => s.temp, max: 100, on: true },
  { id: "gpuT", label: "Température GPU", color: "#c0775a", pick: (s) => s.gpu_t, max: 100, on: false },
  { id: "pct", label: "Ventilateur (%)", color: "#7aa6d6", pick: (s) => s.pct, max: 100, on: true },
  { id: "rpm", label: "RPM (/6000)", color: "#d6d6d6", pick: (s) => s.rpm, max: 6000, on: false },
  { id: "cpu", label: "Charge CPU", color: "#8b9bb4", pick: (s) => s.cpu, max: 100, on: false },
  { id: "gpuU", label: "Charge GPU", color: "#7aa58a", pick: (s) => s.gpu_u, max: 100, on: false },
  { id: "gpuW", label: "Puissance GPU (/100 W)", color: "#a58ac0", pick: (s) => s.gpu_w, max: 100, on: false },
  { id: "bat", label: "Batterie (%)", color: "#7ac0b8", pick: (s) => s.bat, max: 100, on: false },
  { id: "batW", label: "Puissance batterie (/100 W)", color: "#c0b07a", pick: (s) => (s.bat_w !== undefined ? Math.abs(s.bat_w) : undefined), max: 100, on: false },
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
function formatTime(t: number, hours: number): string {
  const date = new Date(t * 1000)
  return hours <= 24
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function Timeline({ samples, hours, enabled }: { samples: HistorySample[]; hours: number; enabled: Set<string> }) {
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
        <span>{formatTime(t0, hours)}</span>
        <span>{formatTime(t0 + span, hours)}</span>
      </div>
    </div>
  )
}

const FOULING_TEXT: Record<Fouling["status"], string> = {
  insufficient: "Pas encore assez de recul pour se prononcer.",
  ok: "Aucune dérive : à consigne égale, le ventilateur tourne comme au début.",
  watch: "Légère baisse de la vitesse à consigne égale : à surveiller.",
  clean: "Nette baisse de la vitesse à consigne égale : un nettoyage des ventilateurs et des grilles est conseillé.",
}

function FoulingCard({ fouling }: { fouling: Fouling | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Fan className="size-4 text-muted-foreground" /> Encrassement
        </CardTitle>
        <CardDescription>
          Compare, à consigne égale, la vitesse du ventilateur 1 au début de l'historique et aujourd'hui : un ventilateur qui tourne de moins en moins vite pour la même consigne trahit de la poussière ou un roulement fatigué. Il faut au moins 3 jours d'historique.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!fouling ? (
          <p className="text-muted-foreground">Lecture en cours…</p>
        ) : (
          <>
            <p>{FOULING_TEXT[fouling.status]}</p>
            <p className="text-muted-foreground">
              Historique : {fouling.days_covered.toFixed(1)} jour{fouling.days_covered >= 2 ? "s" : ""}
              {fouling.status !== "insufficient" && ` · écart de vitesse ${fouling.drop_percent >= 0 ? "-" : "+"}${Math.abs(fouling.drop_percent).toFixed(1)} % sur ${fouling.buckets} tranche${fouling.buckets > 1 ? "s" : ""} de consigne`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BatteryCard({ details }: { details?: BatteryDetails }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <BatteryMedium className="size-4 text-muted-foreground" /> Santé de la batterie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!details || details.designed_mwh === 0 ? (
          <p className="text-muted-foreground">Le pilote de batterie ne donne pas ces informations.</p>
        ) : (
          <>
            <p>
              Capacité à pleine charge : <span className="font-mono">{(details.full_charged_mwh / 1000).toFixed(1)} Wh</span> sur{" "}
              <span className="font-mono">{(details.designed_mwh / 1000).toFixed(1)} Wh</span> d'origine, soit{" "}
              <span className="font-mono">{Math.round(100 - details.wear_percent)} %</span> de santé.
            </p>
            <p className="text-muted-foreground">
              {details.cycle_count > 0 ? `${details.cycle_count} cycles de charge · ` : ""}
              {details.chemistry ? `Chimie ${details.chemistry} · ` : ""}
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
function duration(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`
}

/** Résumé des dernières 24 heures : température, charge, batterie. */
function DayCard({ day }: { day: DaySummary | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Sun className="size-4 text-muted-foreground" /> Dernières 24 heures
        </CardTitle>
        <CardDescription>
          {day && day.samples > 0 ? `Sur ${day.covered_hours.toFixed(1)} h de mesures.` : "Résumé calculé à partir de l'historique."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!day || day.samples === 0 ? (
          <p className="text-muted-foreground">Pas encore de mesures.</p>
        ) : (
          <>
            <Stat label="Température du processeur" value={`moyenne ${day.avg_temp_c.toFixed(0)}° · maximum ${day.max_temp_c}°`} />
            <Stat label="À 70° ou plus" value={duration(day.minutes_above_70)} />
            <Stat label="Processeur à plus de 80 % de charge" value={day.minutes_high_load > 0 ? duration(day.minutes_high_load) : "—"} />
            {day.max_gpu_temp_c > 0 && <Stat label="Carte graphique, maximum" value={`${day.max_gpu_temp_c}°`} />}
            <Stat label="Sur batterie" value={day.minutes_on_battery > 0 ? duration(day.minutes_on_battery) : "—"} />
            {day.battery_used_wh > 0 && <Stat label="Énergie tirée de la batterie" value={`${day.battery_used_wh.toFixed(1)} Wh`} />}
            {day.battery_charged_wh > 0 && <Stat label="Énergie rechargée" value={`${day.battery_charged_wh.toFixed(1)} Wh`} />}
            <p className="text-muted-foreground">La charge du processeur n'est mesurée que lorsque l'interface est ouverte.</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Historique long : courbes sur plusieurs jours, diagnostic d'encrassement et santé de la batterie. */
export function HistoryTab({ batteryDetails }: { batteryDetails?: BatteryDetails }) {
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
              <HistoryIcon className="size-4 text-muted-foreground" /> Historique
            </CardTitle>
            <CardDescription>
              Une mesure toutes les 30 s, enregistrée par le contrôleur même fenêtre fermée, conservée 14 jours. Les mesures de la carte graphique n'existent que lorsque l'interface était ouverte et la carte allumée.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {RANGES.map((r) => (
              <Button key={r.hours} size="sm" variant={hours === r.hours ? "default" : "outline"} onClick={() => setHours(r.hours)}>
                {r.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!samples ? (
            <p className="text-muted-foreground">Lecture en cours… Si cela dure, le contrôleur est peut-être trop ancien pour cette fonction.</p>
          ) : samples.length < 2 ? (
            <p className="text-muted-foreground">Pas encore de mesures : l'historique se remplit au fil du temps, une mesure toutes les 30 s.</p>
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
                      {s.label}
                    </button>
                  )
                })}
              </div>
              {stat && (
                <p className="text-muted-foreground">
                  Température CPU sur la période : minimum {stat.min}° · moyenne {stat.avg.toFixed(0)}° · maximum {stat.max}°
                </p>
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
