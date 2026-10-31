import { useRef } from "react"
import { curvePath, type CurveMode } from "@/lib/curve-path"
import { useSize } from "@/lib/use-size"
import { cn } from "@/lib/utils"
import type { CurvePoint } from "@/lib/api"
import { tempColor } from "@/lib/thermal"

const PAD = { l: 40, r: 14, t: 18, b: 34 }
const T_MIN = 20
const T_MAX = 100


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

/**
 * Courbe en escalier — fidèle à `Profile.GetPWM` côté Go : la vitesse d'un palier
 * s'applique tant que temp < point.Temp. Les poignées déplacent donc la vitesse du palier.
 */
export function CurveEditor({ points, temp, editable, onChange, mode = "steep", className = "h-72" }: Props) {
  const [wrapRef, W, H] = useSize<HTMLDivElement>(560, 280)
  const x = (t: number) => PAD.l + ((t - T_MIN) / (T_MAX - T_MIN)) * (W - PAD.l - PAD.r)
  const y = (s: number) => PAD.t + (1 - s / 100) * (H - PAD.t - PAD.b)
  const svgRef = useRef<SVGSVGElement>(null)

  const line = curvePath(points, mode, x, y, T_MIN, T_MAX)
  const area = points.length ? `${line} L ${x(T_MAX)} ${y(0)} L ${x(T_MIN)} ${y(0)} Z` : ""

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (!editable || !onChange) return
    e.preventDefault()
    const svg = svgRef.current!
    const move = (ev: PointerEvent) => {
      const rect = svg.getBoundingClientRect()
      const py = ev.clientY - rect.top
      const raw = (1 - (py - PAD.t) / (H - PAD.t - PAD.b)) * 100
      const speed = Math.round(Math.min(100, Math.max(0, raw)) / 5) * 5
      onChange(points.map((p, i) => (i === index ? { ...p, speed } : p)))
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
    <svg ref={svgRef} width={W} height={H} className="absolute top-0 left-0 select-none">
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((s) => (
        <g key={s}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} stroke="var(--border)" strokeDasharray="3 5" />
          <text x={PAD.l - 6} y={y(s) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-xs">
            {s}%
          </text>
        </g>
      ))}
      {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => (
        <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono text-xs">
          {t}°
        </text>
      ))}

      <text x={PAD.l} y={9} className="fill-muted-foreground text-xs">
        Vitesse ventilateur (%)
      </text>
      <text x={W - PAD.r} y={H - 20} textAnchor="end" className="fill-muted-foreground text-xs">
        Température CPU (°C)
      </text>

      {area && <path d={area} fill="var(--primary)" opacity="0.1" />}
      {line && <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />}

      {temp !== undefined && temp >= T_MIN && (
        <g>
          <line x1={x(temp)} x2={x(temp)} y1={PAD.t} y2={H - PAD.b} stroke={tempColor(temp)} strokeWidth="1.5" strokeDasharray="4 3" />
          <circle cx={x(temp)} cy={H - PAD.b} r="3.5" fill={tempColor(temp)} />
        </g>
      )}

      {points.map((p, i) => (
        <g key={i} onPointerDown={startDrag(i)} className={editable ? "cursor-ns-resize" : undefined}>
          <circle cx={x(p.temp)} cy={y(p.speed)} r="12" fill="transparent" />
          <circle
            cx={x(p.temp)}
            cy={y(p.speed)}
            r={editable ? 5.5 : 3.5}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="2.5"
          />
          <text x={x(p.temp)} y={y(p.speed) - 11} textAnchor="middle" className="fill-foreground font-mono text-xs">
            {p.speed}%
          </text>
        </g>
      ))}
    </svg>
    </div>
  )
}
