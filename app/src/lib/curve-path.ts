import type { CurvePoint } from "@/lib/api"

export type CurveMode = "steep" | "smooth"

/**
 * Vitesse (%) que la courbe donne à une température — reprend `GetPWM` / `GetPWMSmooth` côté Go.
 * Sert à placer un nouveau point exactement sur la courbe existante : l'ajouter ne change donc pas le comportement.
 */
export function speedAt(points: CurvePoint[], mode: CurveMode, temp: number): number {
  if (points.length === 0) return 0
  if (mode === "smooth") {
    if (temp <= points[0].temp) return points[0].speed
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      if (temp >= a.temp && temp <= b.temp && b.temp > a.temp) {
        return Math.round(a.speed + ((temp - a.temp) / (b.temp - a.temp)) * (b.speed - a.speed))
      }
    }
    return points[points.length - 1].speed
  }
  return (points.find((p) => temp < p.temp) ?? points[points.length - 1]).speed
}

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
