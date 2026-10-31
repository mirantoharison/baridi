import { requestLog } from "@/lib/request-log"

// IMPORTANT : le sidecar Go n'écoute que sur loopback, port fixe partagé avec src-tauri.
export const BASE_URL = "http://127.0.0.1:8787"

export type FanMode = "auto" | "manual" | "idle"

export interface FanStatus {
  mode: FanMode
  profile: string
  curve_mode: "steep" | "smooth"
  temp_c: number
  rpm: number
  pwm: number
  percent: number
}

export interface CurvePoint {
  temp: number
  speed: number
}

export interface FanProfile {
  id: string
  name: string
  description?: string
  icon?: string
  points: CurvePoint[]
  source: "system" | "user"
  transition?: { step: number; tick_ms: number }
}

/** Toute requête vers le contrôleur passe par ici : elle est journalisée (méthode, chemin, corps, statut, durée). */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET"
  const body = typeof init?.body === "string" ? init.body : undefined
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    })
  } catch (e) {
    requestLog.add({ method, path, body, status: "ERR", ms: elapsed(), error: (e as Error).message })
    throw e
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = err.error ?? `${method} ${path}: ${res.status}`
    requestLog.add({ method, path, body, status: res.status, ms: elapsed(), error: message })
    throw new Error(message)
  }
  requestLog.add({ method, path, body, status: res.status, ms: elapsed() })
  return res.json()
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  status: () => request<FanStatus>("/status"),
  manual: (percent: number) => post<FanStatus>("/fan/manual", { percent }),
  auto: () => post<FanStatus>("/fan/auto"),
  stop: () => post<FanStatus>("/fan/stop"),
  setCurveMode: (mode: "steep" | "smooth") => post<FanStatus>("/fan/curve-mode", { mode }),
  setProfile: (profile: string) => post<FanStatus>("/fan/profile", { profile }),
  profiles: async () => (await request<{ profiles: FanProfile[] }>("/fan/profiles")).profiles,
  saveProfile: (p: FanProfile) => post<FanProfile>("/fan/profiles", p),
  deleteProfile: (id: string) => request<{ deleted: string }>(`/fan/profiles/${id}`, { method: "DELETE" }),
}
