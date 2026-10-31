import { useCallback, useEffect, useRef, useState } from "react"
import { requestLog } from "@/lib/request-log"
import { api, BASE_URL, type FanProfile, type FanStatus } from "@/lib/api"

export interface Sample {
  t: number
  temp: number
  percent: number
  rpm: number
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

    const connect = () => {
      const es = new EventSource(`${BASE_URL}/events`)
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
          [...h, { t: Date.now(), temp: s.temp_c, percent: s.percent, rpm: s.rpm }].slice(-HISTORY_SIZE),
        )
      }
      es.onerror = () => {
        if (wasOpen) requestLog.add({ method: "SSE", path: "/events", status: "LOST" })
        wasOpen = false
        setOnline(false)
        es.close()
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
