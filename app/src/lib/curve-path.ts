import type { CurvePoint } from "@/lib/api"

export type CurveMode = "steep" | "smooth"

/**
 * Pente de la courbe en chaque point (interpolation cubique monotone de Fritsch–Butland) — reprend `monotoneTangents`
 * côté Go. Une pente nulle aux extrema et aux paliers évite tout dépassement entre deux points.
 */
function tangents(points: CurvePoint[]): number[] {
  const n = points.length
  const m = new Array<number>(n).fill(0)
  if (n < 2) return m
  const h = points.slice(1).map((p, k) => p.temp - points[k].temp)
  const d = points.slice(1).map((p, k) => (h[k] > 0 ? (p.speed - points[k].speed) / h[k] : 0))
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) continue
    const w1 = 2 * h[k] + h[k - 1]
    const w2 = h[k] + 2 * h[k - 1]
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
  }
  return m
}

/**
 * Vitesse (%) que la courbe donne à une température — reprend `GetPWM` / `GetPWMSmooth` côté Go.
 * Sert à placer un nouveau point exactement sur la courbe existante : l'ajouter ne change donc pas le comportement.
 */
export function speedAt(points: CurvePoint[], mode: CurveMode, temp: number): number {
  if (points.length === 0) return 0
  if (mode === "smooth") {
    if (temp <= points[0].temp) return points[0].speed
    const last = points[points.length - 1]
    if (temp >= last.temp) return last.speed
    const m = tangents(points)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      if (temp >= a.temp && temp <= b.temp && b.temp > a.temp) {
        const h = b.temp - a.temp
        const t = (temp - a.temp) / h
        const t2 = t * t
        const t3 = t2 * t
        const v = (2 * t3 - 3 * t2 + 1) * a.speed + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * b.speed + (t3 - t2) * h * m[i + 1]
        return Math.round(Math.min(100, Math.max(0, v)))
      }
    }
    return last.speed
  }
  return (points.find((p) => temp < p.temp) ?? points[points.length - 1]).speed
}

/**
 * Tracé SVG d'une courbe, fidèle à la logique du contrôleur Go :
 * - steep  : escalier — la vitesse d'un point s'applique tant que temp < point.temp ;
 * - smooth : courbe arrondie (cubique monotone) passant par les points, sans dépassement ; vitesse du premier point en
 *   dessous, du dernier au-dessus.
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
    const m = tangents(points)
    let d = `M ${x(tMin)} ${y(points[0].speed)} L ${x(points[0].temp)} ${y(points[0].speed)}`
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const h = b.temp - a.temp
      // Un segment de Hermite est un segment de Bézier dont les poignées sont à un tiers de la largeur, le long des pentes.
      d += ` C ${x(a.temp + h / 3)} ${y(a.speed + (m[i] * h) / 3)} ${x(b.temp - h / 3)} ${y(b.speed - (m[i + 1] * h) / 3)} ${x(b.temp)} ${y(b.speed)}`
    }
    return d + tail
  }
  let prev = tMin
  const steps = points.map((p, i) => {
    const seg = `${i === 0 ? "M" : "L"} ${x(prev)} ${y(p.speed)} L ${x(p.temp)} ${y(p.speed)}`
    prev = p.temp
    return seg
  })
  return steps.join(" ") + tail
}
