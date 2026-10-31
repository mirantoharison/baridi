import type { CurvePoint } from "@/lib/api"
import { curvePath, type CurveMode } from "@/lib/curve-path"

const DEFAULT_W = 96
const DEFAULT_H = 32
const T_MIN = 20
const T_MAX = 100

/** Aperçu en escalier d'une courbe (même sémantique que CurveEditor). */
export function MiniCurve({
  points,
  mode = "steep",
  width: W = DEFAULT_W,
  height: H = DEFAULT_H,
  strokeWidth = 1.5,
}: {
  points: CurvePoint[]
  mode?: CurveMode
  width?: number
  height?: number
  strokeWidth?: number
}) {
  const x = (t: number) => ((t - T_MIN) / (T_MAX - T_MIN)) * W
  const y = (s: number) => H - 2 - (s / 100) * (H - 4)
  const d = curvePath(points, mode, x, y, T_MIN, T_MAX)
  return (
    <svg width={W} height={H} className="shrink-0 text-muted-foreground">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  )
}
