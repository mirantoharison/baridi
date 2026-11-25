import { useEffect, useRef } from "react"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { isTauri } from "@/lib/tauri"
import { usePrefs } from "@/lib/prefs"
import type { FanStatus } from "@/lib/api"

/** Écart sous un seuil avant de le réarmer : évite le spam quand la température oscille autour de la limite. */
const REARM_HYSTERESIS_C = 5
/** Délai de grâce avant d'annoncer une perte du contrôleur : il redémarre parfois (veille, relance du sidecar). */
const DISCONNECT_GRACE_MS = 10_000

type Level = "ok" | "warn" | "critical"

async function notify(title: string, body: string) {
  if (!isTauri) return
  try {
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === "granted"
    if (granted) sendNotification({ title, body })
  } catch {
    /* notifications indisponibles (mode concentration, politique système) : l'alerte reste visible dans l'interface */
  }
}

/**
 * Notifications natives sur franchissement de seuil thermique et sur perte du contrôleur.
 *
 * IMPORTANT : une alerte n'est émise qu'au passage à un niveau supérieur, puis le niveau n'est
 * réarmé qu'une fois la température redescendue de REARM_HYSTERESIS_C sous le seuil. Sans cela,
 * une machine qui oscille à 79–81° enverrait une notification par seconde.
 * La webview reste vivante quand la fenêtre est masquée dans le systray, donc l'alerte
 * part aussi dans ce cas — c'est tout l'intérêt.
 */
export function useThermalAlerts(status: FanStatus | null, online: boolean) {
  const { alerts } = usePrefs()
  const levelRef = useRef<Level>("ok")
  // Ref : les callbacks différés (délai de grâce) doivent lire la pause du moment, pas celle du rendu où ils ont été créés.
  const snoozeUntilRef = useRef(alerts.snoozeUntil)
  snoozeUntilRef.current = alerts.snoozeUntil
  const isSnoozed = () => Date.now() < snoozeUntilRef.current

  const temp = status?.temp_c
  useEffect(() => {
    if (!alerts.enabled || temp === undefined) return
    const previous = levelRef.current

    // Chaque niveau est « collant » : on y reste tant qu'on n'est pas redescendu de l'hystérésis sous son seuil.
    let next: Level
    if (temp >= alerts.criticalTemp) next = "critical"
    else if (previous === "critical" && temp > alerts.criticalTemp - REARM_HYSTERESIS_C) next = "critical"
    else if (temp >= alerts.warnTemp) next = "warn"
    else if (previous !== "ok" && temp > alerts.warnTemp - REARM_HYSTERESIS_C) next = "warn"
    else next = "ok"

    levelRef.current = next
    if (next === previous) return

    // IMPORTANT : l'alerte critique ignore la pause — mettre les alertes en sourdine pendant une partie ne doit
    // jamais masquer une vraie surchauffe.
    if (next === "critical") {
      notify("Température critique", `Le processeur est à ${temp}° (seuil ${alerts.criticalTemp}°). Vérifie le ventilateur et le profil actif.`)
    } else if (next === "warn" && previous === "ok" && !isSnoozed()) {
      notify("Température élevée", `Le processeur est à ${temp}° (seuil ${alerts.warnTemp}°).`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSnoozed ne lit qu'une ref
  }, [temp, alerts.enabled, alerts.warnTemp, alerts.criticalTemp])

  // Carte graphique : mêmes règles que le processeur (franchissement, réarmement avec hystérésis), seuils à part. Une
  // carte endormie n'a pas de température : aucune alerte, et on repart de zéro à son réveil.
  const gpuTemp = status?.gpu && !status.gpu.asleep && status.gpu.temp_c > 0 ? status.gpu.temp_c : undefined
  const gpuLevelRef = useRef<Level>("ok")
  useEffect(() => {
    if (!alerts.enabled || !alerts.gpuEnabled) return
    if (gpuTemp === undefined) {
      gpuLevelRef.current = "ok"
      return
    }
    const previous = gpuLevelRef.current
    let next: Level
    if (gpuTemp >= alerts.gpuCriticalTemp) next = "critical"
    else if (previous === "critical" && gpuTemp > alerts.gpuCriticalTemp - REARM_HYSTERESIS_C) next = "critical"
    else if (gpuTemp >= alerts.gpuWarnTemp) next = "warn"
    else if (previous !== "ok" && gpuTemp > alerts.gpuWarnTemp - REARM_HYSTERESIS_C) next = "warn"
    else next = "ok"
    gpuLevelRef.current = next
    if (next === previous) return
    if (next === "critical") {
      notify("Carte graphique : température critique", `La carte est à ${gpuTemp}° (seuil ${alerts.gpuCriticalTemp}°).`)
    } else if (next === "warn" && previous === "ok" && !isSnoozed()) {
      notify("Carte graphique : température élevée", `La carte est à ${gpuTemp}° (seuil ${alerts.gpuWarnTemp}°).`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSnoozed ne lit qu'une ref
  }, [gpuTemp, alerts.enabled, alerts.gpuEnabled, alerts.gpuWarnTemp, alerts.gpuCriticalTemp])

  // Perte du contrôleur : annoncée une seule fois après le délai de grâce, puis la reprise est signalée.
  const wasLostRef = useRef(false)
  useEffect(() => {
    if (!alerts.enabled || !alerts.notifyDisconnect) return
    if (online) {
      if (wasLostRef.current) {
        wasLostRef.current = false
        if (!isSnoozed()) notify("Contrôleur reconnecté", "Le pilotage du ventilateur a repris.")
      }
      return
    }
    const timer = setTimeout(() => {
      // La perte est marquée même en pause : sans ça, la « reprise » ne serait jamais détectée ensuite.
      wasLostRef.current = true
      if (!isSnoozed()) notify("Contrôleur injoignable", "Le ventilateur garde sa dernière vitesse tant que le contrôleur ne répond pas.")
    }, DISCONNECT_GRACE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSnoozed ne lit qu'une ref
  }, [online, alerts.enabled, alerts.notifyDisconnect])
}
