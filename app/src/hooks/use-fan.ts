import { useCallback, useEffect, useRef, useState } from "react"
import { forgetApiKey, getApiKey } from "@/lib/api-key"
import { requestLog } from "@/lib/request-log"
import { api, BASE_URL, type Fan2Curve, type Fan2Mode, type FanProfile, type FanStatus, type TempSource, type TuningPatch } from "@/lib/api"

export interface Sample {
  t: number
  temp: number
  percent: number
  rpm: number
  /** Mesures facultatives : absentes avec un contrôleur ancien ou sans carte NVIDIA. */
  cpuUsage?: number
  gpuTemp?: number
  gpuUsage?: number
  gpuPower?: number
}

const HISTORY_SIZE = 90

/**
 * État live du contrôleur : statut poussé en SSE (1 Hz), historique glissant
 * pour les graphes, et actions. Reconnexion automatique tant que le sidecar démarre.
 */
export function useFan() {
  const [status, setStatus] = useState<FanStatus | null>(null)
  const [profiles, setProfiles] = useState<FanProfile[]>([])
  const [history, setHistory] = useState<Sample[]>([])
  const [online, setOnline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  const refreshProfiles = useCallback(async () => {
    try {
      setProfiles(await api.profiles())
    } catch {
      /* le sidecar n'est pas encore prêt : l'EventSource relancera le chargement */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    // Évite de noyer le journal : une perte de connexion n'est consignée qu'une fois, pas à chaque tentative.
    let wasOpen = false

    const connect = async () => {
      // IMPORTANT : un EventSource ne peut pas envoyer d'en-tête Authorization ; le contrôleur accepte donc la clé en
      // paramètre `token`, mais seulement sur GET /events. Elle n'apparaît pas dans le journal (qui consigne « /events »).
      let key: string
      try {
        key = await getApiKey()
      } catch {
        // Clé pas encore créée (le contrôleur démarre) ou illisible : on réessaie comme pour une connexion perdue.
        if (!cancelled) retry = setTimeout(connect, 1500)
        return
      }
      if (cancelled) return
      const es = new EventSource(`${BASE_URL}/events?token=${encodeURIComponent(key)}`)
      sourceRef.current = es
      es.onopen = () => {
        wasOpen = true
        requestLog.add({ method: "SSE", path: "/events", status: "OPEN" })
        setOnline(true)
        refreshProfiles()
      }
      es.onmessage = (e) => {
        const s = JSON.parse(e.data) as FanStatus
        setStatus(s)
        setHistory((h) =>
          [
            ...h,
            {
              t: Date.now(),
              temp: s.temp_c,
              percent: s.percent,
              rpm: s.rpm,
              cpuUsage: s.cpu?.usage_percent,
              gpuTemp: s.gpu?.temp_c,
              gpuUsage: s.gpu?.usage_percent,
              gpuPower: s.gpu?.power_w,
            },
          ].slice(-HISTORY_SIZE),
        )
      }
      es.onerror = () => {
        if (wasOpen) requestLog.add({ method: "SSE", path: "/events", status: "LOST" })
        wasOpen = false
        setOnline(false)
        es.close()
        // Un refus (clé périmée) ressemble à n'importe quelle erreur de flux : on relit la clé à la prochaine tentative.
        forgetApiKey()
        if (!cancelled) retry = setTimeout(connect, 1500)
      }
    }
    connect()
    return () => {
      cancelled = true
      clearTimeout(retry)
      sourceRef.current?.close()
    }
  }, [refreshProfiles])

  /** Applique la réponse du serveur tout de suite, sans attendre le prochain tick SSE. */
  const run = useCallback(async (action: Promise<FanStatus>) => {
    try {
      setError(null)
      setStatus(await action)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  return {
    status,
    profiles,
    history,
    online,
    error,
    setManual: (percent: number) => run(api.manual(percent)),
    setAuto: () => run(api.auto()),
    stop: () => run(api.stop()),
    setCurveMode: (mode: "steep" | "smooth") => run(api.setCurveMode(mode)),
    setTuning: (patch: TuningPatch) => run(api.setTuning(patch)),
    setFan2: (mode: Fan2Mode, percent?: number) => run(api.setFan2(mode, percent)),
    setFan2Curve: (curve: Fan2Curve) => run(api.setFan2Curve(curve)),
    setTempSource: (source: TempSource) => run(api.setTempSource(source)),
    selectProfile: (id: string) => run(api.setProfile(id)),
    async saveProfile(p: FanProfile) {
      try {
        setError(null)
        await api.saveProfile(p)
        await refreshProfiles()
      } catch (e) {
        setError((e as Error).message)
      }
    },
    async deleteProfile(id: string) {
      try {
        setError(null)
        await api.deleteProfile(id)
        await refreshProfiles()
      } catch (e) {
        setError((e as Error).message)
      }
    },
  }
}
