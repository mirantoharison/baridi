import type { CurvePoint } from "@/lib/api"

export type CurveMode = "steep" | "smooth"

/**
 * Tracé SVG d'une courbe, fidèle à la logique du contrôleur Go :
 * - steep  : escalier — la vitesse d'un point s'applique tant que temp < point.temp ;
 * - smooth : interpolation linéaire entre les points (vitesse du premier point en dessous, du dernier au-dessus).
 */
export function curvePath(
  points: CurvePoint[],
  mode: CurveMode,
  x: (t: number) => number,
  y: (s: number) => number,
  tMin: number,
  tMax: number,
): string {
  if (points.length === 0) return ""
  const last = points[points.length - 1]
  const tail = last.temp < tMax ? ` L ${x(tMax)} ${y(last.speed)}` : ""
  if (mode === "smooth") {
    const head = `M ${x(tMin)} ${y(points[0].speed)}`
    return head + points.map((p) => ` L ${x(p.temp)} ${y(p.speed)}`).join("") + tail
  }
  let prev = tMin
  const steps = points.map((p, i) => {
    const seg = `${i === 0 ? "M" : "L"} ${x(prev)} ${y(p.speed)} L ${x(p.temp)} ${y(p.speed)}`
    prev = p.temp
    return seg
  })
  return steps.join(" ") + tail
}
