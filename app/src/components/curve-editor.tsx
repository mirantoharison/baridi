import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { curvePath, speedAt, type CurveMode } from "@/lib/curve-path"
import { useSize } from "@/lib/use-size"
import { cn } from "@/lib/utils"
import type { CurvePoint } from "@/lib/api"
import { tempColor } from "@/lib/thermal"

const PAD = { l: 40, r: 14, t: 18, b: 34 }
const T_MIN = 20
const T_MAX = 100
const SPEED_STEP = 5
/** Au-delà, la courbe devient illisible et chaque palier ne représente plus qu'un à-coup de quelques degrés. */
const MAX_POINTS = 12
/** Écart minimal entre deux points : la courbe doit rester strictement croissante en température. */
const MIN_TEMP_GAP = 1

interface Props {
  points: CurvePoint[]
  /** Température CPU courante (marqueur vertical). */
  temp?: number
  editable?: boolean
  /** steep = escalier, smooth = interpolation linéaire. */
  mode?: CurveMode
  /** Dimensions du conteneur : le graphe remplit toute la place disponible. */
  className?: string
  onChange?: (points: CurvePoint[]) => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Courbe fidèle à `Profile.GetPWM` côté Go (voir curve-path.ts).
 *
 * En édition :
 * - glisser un point règle sa vitesse (par pas de 5 %) et sa température (par degré, sans dépasser ses voisins) ;
 * - double-clic sur le graphique ajoute un point sur la courbe, double-clic sur un point le retire (il en reste au moins un) ;
 * - au clavier, un point sélectionné se déplace avec les flèches (↑↓ vitesse, ←→ température) et se retire avec Suppr.
 */
export function CurveEditor({ points, temp, editable, onChange, mode = "steep", className = "h-72" }: Props) {
  const { t } = useTranslation()
  const [wrapRef, W, H] = useSize<HTMLDivElement>(560, 280)
  const [active, setActive] = useState<number | null>(null)
  const draggingRef = useRef(false)
  const x = (t: number) => PAD.l + ((t - T_MIN) / (T_MAX - T_MIN)) * (W - PAD.l - PAD.r)
  const y = (s: number) => PAD.t + (1 - s / 100) * (H - PAD.t - PAD.b)
  const svgRef = useRef<SVGSVGElement>(null)

  const line = curvePath(points, mode, x, y, T_MIN, T_MAX)
  const area = points.length ? `${line} L ${x(T_MAX)} ${y(0)} L ${x(T_MIN)} ${y(0)} Z` : ""

  /** Bornes de température d'un point : entre ses voisins, et dans l'étendue du graphe. */
  const tempBounds = (i: number): [number, number] => {
    const lo = i > 0 ? points[i - 1].temp + MIN_TEMP_GAP : T_MIN
    const hi = i < points.length - 1 ? points[i + 1].temp - MIN_TEMP_GAP : T_MAX
    // Tableau non trié (saisie en cours dans le formulaire) : on fige la température plutôt que d'inverser les bornes.
    return lo <= hi ? [lo, hi] : [points[i].temp, points[i].temp]
  }

  const update = (i: number, patch: Partial<CurvePoint>) => onChange?.(points.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const removePoint = (i: number) => {
    if (points.length <= 1) return
    onChange?.(points.filter((_, j) => j !== i))
    setActive(null)
  }

  const startDrag = (index: number) => (e: React.PointerEvent<SVGGElement>) => {
    if (!editable || !onChange) return
    // IMPORTANT : pas de preventDefault ici — il supprimerait le focus au clic et le double-clic qui retire un point.
    e.currentTarget.focus()
    setActive(index)
    draggingRef.current = true
    const svg = svgRef.current!
    const [tLo, tHi] = tempBounds(index)
    const move = (ev: PointerEvent) => {
      const rect = svg.getBoundingClientRect()
      const rawSpeed = (1 - (ev.clientY - rect.top - PAD.t) / (H - PAD.t - PAD.b)) * 100
      const rawTemp = T_MIN + ((ev.clientX - rect.left - PAD.l) / (W - PAD.l - PAD.r)) * (T_MAX - T_MIN)
      update(index, {
        speed: Math.round(clamp(rawSpeed, 0, 100) / SPEED_STEP) * SPEED_STEP,
        temp: Math.round(clamp(rawTemp, tLo, tHi)),
      })
    }
    const up = () => {
      draggingRef.current = false
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  /** Double-clic sur le fond : ajoute un point sur la courbe à la température cliquée. */
  const addPointAt = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editable || !onChange || points.length >= MAX_POINTS) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = Math.round(clamp(T_MIN + ((e.clientX - rect.left - PAD.l) / (W - PAD.l - PAD.r)) * (T_MAX - T_MIN), T_MIN, T_MAX))
    // Trop près d'un point existant : l'ajout créerait deux points quasi confondus.
    if (points.some((p) => Math.abs(p.temp - t) < MIN_TEMP_GAP)) return
    const at = points.findIndex((p) => p.temp > t)
    const insertAt = at === -1 ? points.length : at
    const next = [...points]
    // Vitesse lue sur la courbe actuelle : le comportement ne change pas tant qu'on ne déplace pas le point.
    next.splice(insertAt, 0, { temp: t, speed: speedAt(points, mode, t) })
    onChange(next)
    setActive(insertAt)
  }

  const onPointKey = (i: number) => (e: React.KeyboardEvent<SVGGElement>) => {
    if (!editable || !onChange) return
    const [tLo, tHi] = tempBounds(i)
    const p = points[i]
    switch (e.key) {
      case "ArrowUp": update(i, { speed: clamp(p.speed + SPEED_STEP, 0, 100) }); break
      case "ArrowDown": update(i, { speed: clamp(p.speed - SPEED_STEP, 0, 100) }); break
      case "ArrowRight": update(i, { temp: clamp(p.temp + 1, tLo, tHi) }); break
      case "ArrowLeft": update(i, { temp: clamp(p.temp - 1, tLo, tHi) }); break
      case "Delete":
      case "Backspace": removePoint(i); break
      default: return
    }
    e.preventDefault()
  }

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
    <svg
      ref={svgRef}
      width={W}
      height={H}
      className="absolute top-0 left-0 select-none"
      style={{ touchAction: editable ? "none" : undefined }}
      onDoubleClick={addPointAt}
    >
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((s) => (
        <g key={s}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} stroke="var(--border)" strokeDasharray="3 5" />
          <text x={PAD.l - 6} y={y(s) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-xs">
            {s}%
          </text>
        </g>
      ))}
      {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((deg) => (
        <text key={deg} x={x(deg)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono text-xs">
          {deg}°
        </text>
      ))}

      <text x={PAD.l} y={9} className="fill-muted-foreground text-xs">
        {t("profiles.editor.fanSpeed")}
      </text>
      <text x={W - PAD.r} y={H - 20} textAnchor="end" className="fill-muted-foreground text-xs">
        {t("profiles.editor.cpuTemp")}
      </text>

      {area && <path d={area} fill="var(--primary)" opacity="0.1" />}
      {line && <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />}

      {temp !== undefined && temp >= T_MIN && (
        <g>
          <line x1={x(temp)} x2={x(temp)} y1={PAD.t} y2={H - PAD.b} stroke={tempColor(temp)} strokeWidth="1.5" strokeDasharray="4 3" />
          <circle cx={x(temp)} cy={H - PAD.b} r="3.5" fill={tempColor(temp)} />
        </g>
      )}

      {points.map((p, i) => {
        const isActive = editable && active === i
        return (
          <g
            key={i}
            tabIndex={editable ? 0 : undefined}
            role={editable ? "slider" : undefined}
            aria-label={editable ? t("profiles.editor.point", { n: i + 1, temp: p.temp, speed: p.speed }) : undefined}
            aria-valuenow={editable ? p.speed : undefined}
            aria-valuemin={editable ? 0 : undefined}
            aria-valuemax={editable ? 100 : undefined}
            onPointerDown={startDrag(i)}
            onPointerEnter={() => editable && !draggingRef.current && setActive(i)}
            onPointerLeave={() => !draggingRef.current && setActive((a) => (a === i ? null : a))}
            onFocus={() => editable && setActive(i)}
            onBlur={() => setActive((a) => (a === i ? null : a))}
            onKeyDown={onPointKey(i)}
            onDoubleClick={(e) => {
              // Sans stopPropagation, le double-clic remonterait au fond et ajouterait un point juste après avoir retiré celui-ci.
              e.stopPropagation()
              if (editable) removePoint(i)
            }}
            className={cn("outline-none", editable && "cursor-move")}
          >
            <circle cx={x(p.temp)} cy={y(p.speed)} r="12" fill="transparent" />
            <circle
              cx={x(p.temp)}
              cy={y(p.speed)}
              r={editable ? (isActive ? 7 : 5.5) : 3.5}
              fill="var(--card)"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
            <text x={x(p.temp)} y={y(p.speed) - 11} textAnchor="middle" className="fill-foreground font-mono text-xs">
              {isActive ? `${p.temp}° · ${p.speed}%` : `${p.speed}%`}
            </text>
          </g>
        )
      })}
    </svg>
    </div>
  )
}
