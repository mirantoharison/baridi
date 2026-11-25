import i18n from "@/i18n"

/**
 * Garde-fous de l'interface : avertissements AVANT un réglage qui laisserait le processeur sans refroidissement suffisant.
 *
 * IMPORTANT : ce sont des confirmations, jamais des interdictions — l'utilisateur garde le dernier mot
 * (un test de bruit à vitesse basse peut être voulu). Ils ne s'appliquent qu'aux actions manuelles de la page
 * Pilotage ; le mode Auto et les profils ne passent pas par ici.
 */

/** Au-dessus de cette température, passer en Arrêt fige le ventilateur sur sa dernière vitesse : on prévient. */
export const STOP_WARN_TEMP_C = 60

/** Vitesse minimale conseillée par palier de température, du plus chaud au plus froid. */
const MIN_SPEED_BY_TEMP: { temp: number; min: number }[] = [
  { temp: 80, min: 60 },
  { temp: 70, min: 40 },
  { temp: 60, min: 25 },
]

/** Message d'avertissement si une vitesse manuelle est trop basse pour la température courante, sinon null. */
export function manualSpeedWarning(temp: number, percent: number): string | null {
  const rule = MIN_SPEED_BY_TEMP.find((r) => temp >= r.temp)
  if (!rule || percent >= rule.min) return null
  return i18n.t("control.guards.manual", { temp, percent, min: rule.min })
}

/** Message d'avertissement avant de couper le pilotage automatique à chaud, sinon null. */
export function stopWarning(temp: number): string | null {
  if (temp < STOP_WARN_TEMP_C) return null
  return i18n.t("control.guards.stop", { temp })
}
