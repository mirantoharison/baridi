import { ChartPath } from "@/components/chart-path"
import { useTranslation } from "react-i18next"

export interface ChartSeries {
  id: string
  /** Libellé déjà traduit, affiché dans la légende. */
  label: string
  color: string
  /** Valeurs du plus ancien au plus récent ; `undefined` = trou (non mesuré). */
  values: (number | undefined)[]
  /** Valeur en haut du graphe (échelle propre à la série, pour tracer des unités différentes sur un même cadre). */
  max: number
}

const W = 600
const H = 120

/** Chemin SVG d'une série ; les trous interrompent le tracé au lieu de tomber à zéro. */
function pathOf(values: (number | undefined)[], max: number): string {
  if (values.length < 2) return ""
  const step = W / (values.length - 1)
  let d = ""
  let isPenDown = false
  values.forEach((v, i) => {
    if (v === undefined) {
      isPenDown = false
      return
    }
    d += `${isPenDown ? "L" : "M"} ${(i * step).toFixed(1)} ${(H - (Math.min(v, max) / max) * H).toFixed(1)} `
    isPenDown = true
  })
  return d
}

/** Graphique multi-séries, chacune normalisée sur son propre maximum ; légende avec dernière valeur. */
export function LineChart({ series, unitOf }: { series: ChartSeries[]; unitOf: Record<string, string> }) {
  const { t } = useTranslation()
  const hasData = series.some((s) => s.values.filter((v) => v !== undefined).length >= 2)
  if (!hasData) return <p className="text-muted-foreground">{t("history.empty")}</p>
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full border bg-muted/20" role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--border)" strokeDasharray="3 5" />
        ))}
        {series.map((s) => (
          <ChartPath key={s.id} d={pathOf(s.values, s.max)} height={H} color={s.color} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => {
          const last = [...s.values].reverse().find((v) => v !== undefined)
          return (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="size-2" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-mono tabular-nums">{last === undefined ? "–" : `${Math.round(last)}${unitOf[s.id] ?? ""}`}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
