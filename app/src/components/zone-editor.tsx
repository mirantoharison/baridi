import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import { Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import type { CurvePoint } from "@/lib/api"
import { speedAt, type CurveMode } from "@/lib/curve-path"

const T_MIN = 20
const T_MAX = 100
const SPEED_STEP = 5
/** Au-delà, les paliers deviennent trop étroits pour être saisis. */
const MAX_POINTS = 10
/** Écart minimal entre deux seuils : la courbe doit rester strictement croissante en température. */
const MIN_TEMP_GAP = 1

const noop = () => {}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const pctOf = (temp: number) => ((temp - T_MIN) / (T_MAX - T_MIN)) * 100

/**
 * Couleur d'une température : les mêmes teintes que le reste de l'application (variables --cool, --warm, --hot de la jauge
 * et des graphiques), mélangées en continu. Franchement fraîche jusqu'à 45 °C, orange à 65 °C, rouge à partir de 80 °C — les
 * seuils de `tempColor`.
 */
function tempShade(temp: number): string {
  const mix = (from: string, to: string, ratio: number) => `color-mix(in oklch, var(${to}) ${Math.round(clamp(ratio, 0, 1) * 100)}%, var(${from}))`
  if (temp <= 45) return "var(--cool)"
  if (temp < 65) return mix("--cool", "--warm", (temp - 45) / 20)
  if (temp < 80) return mix("--warm", "--hot", (temp - 65) / 15)
  return "var(--hot)"
}

/** Même couleur, rendue translucide : fond des colonnes de vitesse. */
const soft = (color: string) => `color-mix(in oklch, ${color} 28%, transparent)`

interface Props {
  points: CurvePoint[]
  /** Température courante : repère sur la barre. */
  temp?: number
  /** Absent = lecture seule : ni poignées, ni boutons, ni glissement. */
  onChange?: (points: CurvePoint[]) => void
  /** Remplit la hauteur disponible : les colonnes de vitesse s'étirent au lieu de garder une hauteur fixe. */
  fill?: boolean
  /** Mode de lecture de la courbe, pour calculer la vitesse à la température courante (lissée par défaut). */
  mode?: CurveMode
  /** Les vitesses ne peuvent pas baisser d'un palier au suivant (exigé pour la courbe du ventilateur 2). */
  increasing?: boolean
  /** Vitesse minimale du dernier palier (le contrôleur refuse une courbe qui reste basse à haute température). */
  minTopSpeed?: number
}

/**
 * Courbe de refroidissement simplifiée, réglée directement à la souris :
 * - la barre du haut va de 20 à 100 °C et se découpe en paliers ; on fait glisser la poignée d'un seuil pour le déplacer
 *   (au degré près, sans dépasser ses voisins) ;
 * - sous la barre, une colonne par palier : on la tire vers le haut ou le bas pour régler la vitesse du ventilateur (par 5 %) ;
 * - double-clic sur une poignée pour retirer le palier ; au clavier, ←→ règle un seuil, ↑↓ une vitesse, Suppr retire.
 * Un palier couvre les températures entre le seuil précédent et le sien ; au-delà du dernier seuil la vitesse du dernier
 * palier continue (zone grisée).
 */
export function ZoneEditor({ points, temp, onChange = noop, fill, mode = "smooth", increasing, minTopSpeed = 0 }: Props) {
  const { t } = useTranslation()
  const isReadOnly = onChange === noop
  const barRef = useRef<HTMLDivElement>(null)
  const n = points.length

  const setTemp = (i: number, v: number) => {
    const lo = i > 0 ? points[i - 1].temp + MIN_TEMP_GAP : T_MIN
    const hi = i < n - 1 ? points[i + 1].temp - MIN_TEMP_GAP : T_MAX
    if (lo > hi) return
    const next = clamp(v, lo, hi)
    if (next !== points[i].temp) onChange(points.map((p, j) => (j === i ? { ...p, temp: next } : p)))
  }
  const setSpeed = (i: number, v: number) => {
    // Bornes de la vitesse : entre celles des voisins si elle doit croître, et au moins `minTopSpeed` pour le dernier palier.
    let lo = increasing && i > 0 ? points[i - 1].speed : 0
    const hi = increasing && i < n - 1 ? points[i + 1].speed : 100
    if (i === n - 1) lo = Math.max(lo, minTopSpeed)
    const next = clamp(Math.round(v / SPEED_STEP) * SPEED_STEP, lo, hi)
    if (next !== points[i].speed) onChange(points.map((p, j) => (j === i ? { ...p, speed: next } : p)))
  }
  const remove = (i: number) => {
    if (n <= 1) return
    const next = points.filter((_, j) => j !== i)
    // Retirer le dernier palier ne doit pas laisser une courbe trop basse en fin de plage.
    const last = next[next.length - 1]
    if (last.speed < minTopSpeed) next[next.length - 1] = { ...last, speed: minTopSpeed }
    onChange(next)
  }

  /** Nouveau palier après le dernier : 10 °C plus haut (dans la limite de la barre) et au moins aussi rapide. */
  const add = () => {
    const last = points[n - 1]
    if (!last || n >= MAX_POINTS || last.temp + MIN_TEMP_GAP > T_MAX) return
    onChange([...points, { temp: Math.min(T_MAX, last.temp + 10), speed: Math.min(100, last.speed + 10) }])
  }

  const tempFromX = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return T_MIN
    return Math.round(T_MIN + ((clientX - rect.left) / rect.width) * (T_MAX - T_MIN))
  }

  // Le glissement passe par la capture du pointeur : il continue même quand la souris sort de la poignée.
  const startDrag = (e: PointerEvent<HTMLElement>) => e.currentTarget.setPointerCapture(e.pointerId)
  const isDragging = (e: PointerEvent<HTMLElement>) => e.currentTarget.hasPointerCapture(e.pointerId)

  const onHandleKey = (i: number, e: KeyboardEvent) => {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => setTemp(i, points[i].temp - 1),
      ArrowRight: () => setTemp(i, points[i].temp + 1),
      ArrowUp: () => setSpeed(i, points[i].speed + SPEED_STEP),
      ArrowDown: () => setSpeed(i, points[i].speed - SPEED_STEP),
      Delete: () => remove(i),
    }
    if (moves[e.key]) {
      e.preventDefault()
      moves[e.key]()
    }
  }

  const color = (i: number) => tempShade(points[i].temp)
  const start = (i: number) => (i === 0 ? T_MIN : points[i - 1].temp)
  const lastTemp = points[n - 1]?.temp ?? T_MIN

  return (
    <div className={fill ? "flex flex-1 flex-col gap-2 select-none" : "space-y-2 select-none"}>
      {/* Seuils, au-dessus de la barre */}
      <div className="relative h-5">
        {points.map((p, i) => (
          <span key={i} className="absolute -translate-x-1/2 font-mono text-xs font-semibold tabular-nums" style={{ left: `${pctOf(p.temp)}%` }}>
            {p.temp}°
          </span>
        ))}
      </div>

      {/* Barre des températures : paliers colorés, poignées de seuil, repère de la température courante */}
      <div ref={barRef} className="relative mx-3 h-2.5 rounded-full bg-muted">
        {points.map((p, i) => (
          <div key={i} className="absolute inset-y-0" style={{ left: `${pctOf(start(i))}%`, width: `${pctOf(p.temp) - pctOf(start(i))}%`, background: color(i) }} />
        ))}
        {temp !== undefined && <div className="pointer-events-none absolute -top-1 z-10 h-4.5 w-0.5 bg-foreground" style={{ left: `${clamp(pctOf(temp), 0, 100)}%` }} title={`${temp}°C`} />}
        {!isReadOnly && points.map((p, i) => (
          <div
            key={i}
            role="slider"
            tabIndex={0}
            aria-label={t("control.zones.temp")}
            aria-valuemin={T_MIN}
            aria-valuemax={T_MAX}
            aria-valuenow={p.temp}
            title={t("control.zones.handleHint")}
            className="absolute top-1/2 z-20 size-4.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${pctOf(p.temp)}%`, borderColor: color(i) }}
            onPointerDown={startDrag}
            onPointerMove={(e) => isDragging(e) && setTemp(i, tempFromX(e.clientX))}
            onDoubleClick={() => remove(i)}
            onKeyDown={(e) => onHandleKey(i, e)}
          />
        ))}
      </div>

      {/* Température courante et vitesse que la courbe lui donne, sous le repère de la barre */}
      {temp !== undefined && n > 0 && (
        <div className="relative mx-3 h-6">
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-sm border bg-card px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums"
            style={{ left: `${clamp(pctOf(temp), 8, 92)}%` }}
          >
            {temp}° → {speedAt(points, mode, temp)}%
          </span>
        </div>
      )}

      {/* Vitesses : une colonne par palier, tirée vers le haut ou le bas */}
      <div className={fill ? "relative mx-3 min-h-28 flex-1" : "relative mx-3 h-28"}>
        {points.map((p, i) => (
          <div
            key={i}
            role={isReadOnly ? undefined : "slider"}
            tabIndex={isReadOnly ? undefined : 0}
            aria-label={t("control.zones.speed")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={p.speed}
            className={isReadOnly ? "absolute inset-y-0 px-px" : "absolute inset-y-0 cursor-ns-resize touch-none px-px outline-none focus-visible:ring-2 focus-visible:ring-ring"}
            style={{ left: `${pctOf(start(i))}%`, width: `${pctOf(p.temp) - pctOf(start(i))}%` }}
            onPointerDown={(e) => {
              if (isReadOnly) return
              startDrag(e)
              const rect = e.currentTarget.getBoundingClientRect()
              setSpeed(i, (1 - (e.clientY - rect.top) / rect.height) * 100)
            }}
            onPointerMove={(e) => {
              if (isReadOnly || !isDragging(e)) return
              const rect = e.currentTarget.getBoundingClientRect()
              setSpeed(i, (1 - (e.clientY - rect.top) / rect.height) * 100)
            }}
            onKeyDown={(e) => onHandleKey(i, e)}
          >
            <div className="absolute inset-x-px bottom-0 border-t-2" style={{ height: `${p.speed}%`, borderColor: color(i), background: soft(color(i)) }}>
            </div>
          </div>
        ))}
        {/* Au-delà du dernier seuil : la vitesse du dernier palier continue */}
        {lastTemp < T_MAX && n > 0 && (
          <div className="pointer-events-none absolute inset-y-0 px-px" style={{ left: `${pctOf(lastTemp)}%`, width: `${100 - pctOf(lastTemp)}%` }}>
            <div className="absolute inset-x-px bottom-0 border-t-2 border-dashed border-muted-foreground/50 bg-muted/30" style={{ height: `${points[n - 1].speed}%` }} />
          </div>
        )}
      </div>

      {/* Vitesse de chaque palier, toujours en bas */}
      <div className="relative mx-3 h-5 text-muted-foreground">
        {points.map((p, i) => (
          <span key={i} className="absolute truncate text-center font-mono text-xs font-semibold tabular-nums text-foreground" style={{ left: `${pctOf(start(i))}%`, width: `${pctOf(p.temp) - pctOf(start(i))}%` }}>
            {p.speed}%
          </span>
        ))}
      </div>

      {!isReadOnly && (
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground">{t("control.zones.hint")}</p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" disabled={n <= 1} onClick={() => remove(n - 1)}>
            <Minus /> {t("control.zones.removeLast")}
          </Button>
          <Button size="sm" variant="outline" disabled={n >= MAX_POINTS || lastTemp >= T_MAX} onClick={add}>
            <Plus /> {t("control.zones.add")}
          </Button>
        </div>
      </div>
      )}
    </div>
  )
}
