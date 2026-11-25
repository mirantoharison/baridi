import { useEffect, useRef } from "react"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import i18n from "@/i18n"
import { isTauri } from "@/lib/tauri"
import { usePrefs } from "@/lib/prefs"
import type { FanStatus } from "@/lib/api"

/** Écart sous un seuil avant de le réarmer : évite le spam quand la température oscille autour de la limite. */
const REARM_HYSTERESIS_C = 5
/**
 * Un ventilateur est jugé bloqué quand il reçoit au moins cette consigne (en %) mais mesure 0 RPM pendant tout ce délai.
 * Plus bas qu'à 30 %, certains ventilateurs ne démarrent pas ; plus court, la mise en route d'un arrêt à froid (rotor qui
 * démarre, capteur qui rattrape) déclencherait de fausses alertes.
 */
const STALL_MIN_PERCENT = 30
const STALL_AFTER_MS = 15_000

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
      notify(i18n.t("common.notify.criticalTitle"), i18n.t("common.notify.criticalBody", { temp, threshold: alerts.criticalTemp }))
    } else if (next === "warn" && previous === "ok" && !isSnoozed()) {
      notify(i18n.t("common.notify.warnTitle"), i18n.t("common.notify.warnBody", { temp, threshold: alerts.warnTemp }))
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
      notify(i18n.t("common.notify.gpuCriticalTitle"), i18n.t("common.notify.gpuCriticalBody", { temp: gpuTemp, threshold: alerts.gpuCriticalTemp }))
    } else if (next === "warn" && previous === "ok" && !isSnoozed()) {
      notify(i18n.t("common.notify.gpuWarnTitle"), i18n.t("common.notify.gpuWarnBody", { temp: gpuTemp, threshold: alerts.gpuWarnTemp }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSnoozed ne lit qu'une ref
  }, [gpuTemp, alerts.enabled, alerts.gpuEnabled, alerts.gpuWarnTemp, alerts.gpuCriticalTemp])

  // Ventilateur bloqué : consigne d'au moins STALL_MIN_PERCENT, mais 0 RPM pendant STALL_AFTER_MS. Une alerte par ventilateur,
  // réarmée dès que le ventilateur tourne de nouveau. Le ventilateur 2 n'est surveillé que s'il est piloté par l'application :
  // en mode « BIOS » c'est le firmware qui décide, et un arrêt à froid y est normal.
  const percent = status?.percent
  const rpm = status?.rpm
  const fan2Rpm = status?.fan2_rpm
  const fan2Mode = status?.fan2_mode
  const stallSince = useRef<{ fan1?: number; fan2?: number }>({})
  const stallNotified = useRef<{ fan1: boolean; fan2: boolean }>({ fan1: false, fan2: false })
  useEffect(() => {
    if (!alerts.enabled || !alerts.notifyFanStall || percent === undefined || rpm === undefined) return
    const now = Date.now()
    const check = (key: "fan1" | "fan2", isStalled: boolean, title: string) => {
      if (!isStalled) {
        stallSince.current[key] = undefined
        stallNotified.current[key] = false
        return
      }
      stallSince.current[key] ??= now
      if (!stallNotified.current[key] && now - (stallSince.current[key] as number) >= STALL_AFTER_MS) {
        stallNotified.current[key] = true
        if (!isSnoozed()) notify(title, i18n.t("common.notify.stallBody", { percent }))
      }
    }
    check("fan1", percent >= STALL_MIN_PERCENT && rpm === 0, i18n.t("common.notify.stallTitle1"))
    check("fan2", fan2Rpm !== undefined && fan2Mode !== undefined && fan2Mode !== "firmware" && percent >= STALL_MIN_PERCENT && fan2Rpm === 0, i18n.t("common.notify.stallTitle2"))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSnoozed ne lit qu'une ref
  }, [percent, rpm, fan2Rpm, fan2Mode, alerts.enabled, alerts.notifyFanStall])

  // Perte du contrôleur : annoncée une seule fois après le délai de grâce, puis la reprise est signalée.
  const wasLostRef = useRef(false)
  useEffect(() => {
    if (!alerts.enabled || !alerts.notifyDisconnect) return
    if (online) {
      if (wasLostRef.current) {
        wasLostRef.current = false
        if (!isSnoozed()) notify(i18n.t("common.notify.reconnectedTitle"), i18n.t("common.notify.reconnectedBody"))
      }
      return
    }
    const timer = setTimeout(() => {
      // La perte est marquée même en pause : sans ça, la « reprise » ne serait jamais détectée ensuite.
      wasLostRef.current = true
      if (!isSnoozed()) notify(i18n.t("common.notify.lostTitle"), i18n.t("common.notify.lostBody"))
    }, DISCONNECT_GRACE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSnoozed ne lit qu'une ref
  }, [online, alerts.enabled, alerts.notifyDisconnect])
}
