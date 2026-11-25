import { ChartPath } from "@/components/chart-path"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Sample } from "@/hooks/use-fan"
import { cn } from "@/lib/utils"

const W = 600
const H = 120

function path(values: (number | undefined)[], max: number) {
  const pts = values.map((v) => (v === undefined ? 0 : v))
  if (pts.length < 2) return ""
  const step = W / (pts.length - 1)
  return pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(H - (Math.min(v, max) / max) * H).toFixed(1)}`)
    .join(" ")
}

/**
 * Séries affichables. Toutes sont normalisées sur 0–100 pour partager un même axe : températures en °C (0–100),
 * charges en %, puissance GPU rapportée à 100 W (échelle indicative), RPM rapportés à 6000.
 * `always` = série tracée d'office (température CPU, ventilateur) ; les autres s'activent à la demande.
 */
interface Series {
  id: string
  /** Clé de traduction du libellé. */
  labelKey: string
  color: string
  pick: (s: Sample) => number | undefined
  max: number
  always?: boolean
}

const SERIES: Series[] = [
  { id: "temp", labelKey: "info.series.temp", color: "url(#temp-gradient)", pick: (s) => s.temp, max: 100, always: true },
  { id: "fan", labelKey: "info.series.fan", color: "var(--primary)", pick: (s) => s.percent, max: 100, always: true },
  { id: "cpuUsage", labelKey: "info.series.cpuUsage", color: "#8b9bb4", pick: (s) => s.cpuUsage, max: 100 },
  { id: "gpuTemp", labelKey: "info.series.gpuTemp", color: "#c08a5a", pick: (s) => s.gpuTemp, max: 100 },
  { id: "gpuUsage", labelKey: "info.series.gpuUsage", color: "#7aa58a", pick: (s) => s.gpuUsage, max: 100 },
  { id: "gpuPower", labelKey: "info.series.gpuPower", color: "#a58ac0", pick: (s) => s.gpuPower, max: 100 },
  { id: "rpm", labelKey: "info.series.rpm", color: "#d6d6d6", pick: (s) => s.rpm, max: 6000 },
]

/** Historique récent : température et ventilateur d'office, autres séries à cocher (celles sans donnée sont masquées). */
export function HistoryChart({ history }: { history: Sample[] }) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const available = SERIES.filter((s) => s.always || history.some((h) => s.pick(h) !== undefined))
  const toggle = (id: string) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className="flex h-full min-h-36 flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 overflow-visible">
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1="0" x2={W} y1={H * r} y2={H * r} stroke="var(--border)" strokeDasharray="3 5" />
        ))}
        {/* Dégradé vertical aligné sur l'échelle 0–100° : la ligne change de couleur selon la température atteinte. */}
        <defs>
          <linearGradient id="temp-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
            <stop offset="0.2" style={{ stopColor: "var(--hot)" }} />
            <stop offset="0.35" style={{ stopColor: "var(--warm)" }} />
            <stop offset="0.45" style={{ stopColor: "var(--cool)" }} />
          </linearGradient>
        </defs>
        {available
          .filter((s) => s.always || enabled.has(s.id))
          .map((s) => (
            <ChartPath key={s.id} d={path(history.map(s.pick), s.max)} height={H} color={s.color} fillColor={s.color.startsWith("url(") ? "var(--warm)" : undefined} />
          ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {available.map((s) => {
          const isOn = s.always || enabled.has(s.id)
          return (
            <button
              key={s.id}
              type="button"
              disabled={s.always}
              onClick={() => toggle(s.id)}
              aria-pressed={isOn}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 ring-border transition-colors",
                isOn ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground",
                s.always && "cursor-default",
              )}
            >
              <i className="inline-block h-0.5 w-4" style={{ background: s.id === "temp" ? "var(--warm)" : s.color, opacity: isOn ? 1 : 0.35 }} />
              {t(s.labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
