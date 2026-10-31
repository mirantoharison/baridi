import { useSyncExternalStore } from "react"
import { call, isTauri } from "@/lib/tauri"

export interface LogEntry {
  id: number
  /** Horodatage (ms). */
  t: number
  method: string
  path: string
  body?: string
  /** Code HTTP, ou "ERR" (réseau), "OPEN" / "LOST" (flux SSE). */
  status: number | "ERR" | "OPEN" | "LOST"
  ms?: number
  error?: string
}

const KEY = "fancontroller:request-log"
const SESSION_KEY = "fancontroller:request-log-session"
export const MAX_LOG_LINES = 500

let entries: LogEntry[] = []
let nextId = 1
let ready = false
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* quota ou stockage indisponible : le journal reste en mémoire */
  }
}

function emit() {
  for (const l of listeners) l()
}

/**
 * IMPORTANT : le journal vit dans localStorage mais ne doit pas survivre à l'application.
 * Rust vide le stockage à la fermeture réelle (menu « Quitter » du systray) ; en plus, chaque
 * lancement reçoit un identifiant de session — si celui stocké diffère (crash, arrêt brutal),
 * on repart d'un journal vide.
 */
async function init() {
  let session = "dev-browser"
  if (isTauri) {
    try {
      session = await call<string>("session_id")
    } catch {
      /* on garde l'identifiant de repli */
    }
  }
  let base: LogEntry[] = []
  try {
    if (localStorage.getItem(SESSION_KEY) === session) {
      base = JSON.parse(localStorage.getItem(KEY) ?? "[]") as LogEntry[]
    }
    localStorage.setItem(SESSION_KEY, session)
  } catch {
    base = []
  }
  // Les requêtes passées avant la fin de l'init (déjà en mémoire) restent les plus récentes.
  entries = [...base, ...entries].slice(-MAX_LOG_LINES)
  nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1
  ready = true
  persist()
  emit()
}
void init()

export const requestLog = {
  add(entry: Omit<LogEntry, "id" | "t">) {
    entries = [...entries, { ...entry, id: nextId++, t: Date.now() }].slice(-MAX_LOG_LINES)
    if (ready) persist()
    emit()
  },
  clear() {
    entries = []
    persist()
    emit()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot: () => entries,
}

export function useRequestLog() {
  return useSyncExternalStore(requestLog.subscribe, requestLog.snapshot)
}
