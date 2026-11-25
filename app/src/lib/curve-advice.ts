import type { CurvePoint, ThermalProfile } from "@/lib/api"

/** Mesures minimales (environ 4 h à une mesure toutes les 30 s) avant de proposer quoi que ce soit : en dessous, le hasard domine. */
const MIN_SAMPLES = 480
/** Part du temps passée à 80 °C ou plus au-delà de laquelle on propose de refroidir davantage. */
const HOT_SHARE_THRESHOLD = 0.03
/** Part du temps passée sous 50 °C, et consigne moyenne à ce moment-là, au-delà desquelles on propose de calmer le ventilateur. */
const COOL_SHARE_THRESHOLD = 0.4
const COOL_AVG_PERCENT_THRESHOLD = 40
/** Amplitude des retouches, en points de pourcentage de vitesse. */
const RAISE_STEP = 10
const LOWER_STEP = 10
const HOT_FROM_C = 70
const COOL_BELOW_C = 50
const MIN_SPEED = 15

export type AdviceStatus = "insufficient" | "fine" | "suggestion"

export interface CurveAdvice {
  status: AdviceStatus
  /** Mesures prises en compte. */
  samples: number
  /** Part du temps à 80 °C ou plus, et part du temps sous 50 °C (0 à 1). */
  hotShare: number
  coolShare: number
  /** Consigne moyenne du ventilateur quand la machine est fraîche. */
  coolAvgPercent: number
  shouldRaise: boolean
  shouldLower: boolean
  /** Courbe proposée (égale à l'actuelle si rien à changer). */
  proposed: CurvePoint[]
}

/**
 * Compare le comportement réel de la machine (historique) à la courbe du profil actif.
 * - Trop de temps au chaud (80 °C ou plus) : on relève de 10 points la vitesse des points à 70 °C et au-delà.
 * - Machine fraîche (sous 50 °C) la plupart du temps mais ventilateur déjà à plus de 40 % en moyenne : on abaisse de
 *   10 points la vitesse des points sous 50 °C (jamais sous 15 %).
 * La proposition n'est jamais appliquée seule : l'utilisateur la voit, puis crée un nouveau profil (le profil d'origine,
 * surtout s'il est du système, n'est pas modifié).
 */
export function adviseCurve(thermal: ThermalProfile | null, points: CurvePoint[]): CurveAdvice {
  const empty: CurveAdvice = { status: "insufficient", samples: thermal?.samples ?? 0, hotShare: 0, coolShare: 0, coolAvgPercent: 0, shouldRaise: false, shouldLower: false, proposed: points }
  if (!thermal || thermal.samples < MIN_SAMPLES || points.length === 0) return empty

  const total = thermal.samples
  const hot = thermal.buckets.filter((b) => b.temp_c >= 80).reduce((n, b) => n + b.samples, 0)
  const cool = thermal.buckets.filter((b) => b.temp_c < COOL_BELOW_C)
  const coolSamples = cool.reduce((n, b) => n + b.samples, 0)
  const coolAvg = coolSamples ? cool.reduce((n, b) => n + b.avg_percent * b.samples, 0) / coolSamples : 0

  const hotShare = hot / total
  const coolShare = coolSamples / total
  const shouldRaise = hotShare >= HOT_SHARE_THRESHOLD
  const shouldLower = coolShare >= COOL_SHARE_THRESHOLD && coolAvg >= COOL_AVG_PERCENT_THRESHOLD

  const proposed = points.map((p) => {
    let speed = p.speed
    if (shouldRaise && p.temp >= HOT_FROM_C) speed = Math.min(100, speed + RAISE_STEP)
    if (shouldLower && p.temp < COOL_BELOW_C) speed = Math.max(MIN_SPEED, speed - LOWER_STEP)
    return { ...p, speed }
  })
  const changed = proposed.some((p, i) => p.speed !== points[i].speed)
  return { ...empty, status: changed ? "suggestion" : "fine", hotShare, coolShare, coolAvgPercent: coolAvg, shouldRaise, shouldLower, proposed }
}
