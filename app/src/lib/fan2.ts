import { speedAt } from "@/lib/curve-path"
import type { Fan2Source, FanStatus } from "@/lib/api"

/**
 * Température que suit une source du ventilateur 2 : processeur, carte graphique ou la plus haute des deux. Une carte
 * endormie n'est jamais mesurée (elle se réveillerait) : on retombe alors sur le processeur, comme le contrôleur.
 */
export function fan2SourceTemp(s: FanStatus, source: Fan2Source): number {
  const gpu = s.gpu && !s.gpu.asleep ? s.gpu.temp_c : 0
  if (source === "gpu" && gpu > 0) return gpu
  if (source === "max") return Math.max(s.temp_c, gpu)
  return s.temp_c
}

/**
 * Consigne (en %) que la courbe propre du ventilateur 2 donne en ce moment, ou null hors du mode « courbe ». Même formule que
 * le contrôleur (courbe lissée sur la température de la source choisie).
 */
export function fan2CurveTarget(s: FanStatus | null | undefined): number | null {
  const curve = s?.fan2_mode === "curve" ? s.fan2_curve : undefined
  if (!s || !curve) return null
  return speedAt(curve.points, "smooth", fan2SourceTemp(s, curve.source))
}
