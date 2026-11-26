import { api, type AutomationConfig, type FanProfile, type FanStatus, type Smoothing, type TempSource } from "@/lib/api"
import { DEFAULT_PREFS, updatePrefs, type Prefs } from "@/lib/prefs"
import type { Fan } from "@/lib/nav"

/** Marqueur et version du format : un fichier d'une autre application, ou d'un format futur, est refusé au lieu d'être mal lu. */
const BACKUP_APP = "baridi-fancontroller"
const BACKUP_VERSION = 1

/** Sauvegarde de tous les réglages : ceux de l'interface (alertes, raccourcis, widget) et ceux du contrôleur. */
export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exported_at: string
  prefs: Prefs
  controller: {
    curve_mode: "steep" | "smooth"
    hysteresis_c: number
    smoothing: Smoothing
    temp_filter_s: number
    temp_source: TempSource
    /** Profil actif au moment de l'export. */
    profile: string
    /** Profils créés par l'utilisateur (ceux du système sont fournis par l'application). */
    custom_profiles: FanProfile[]
    automation: AutomationConfig | null
  }
}

/** Erreur de lecture d'une sauvegarde ; `code` est une clé de traduction (backup.errors.<code>). */
export class BackupError extends Error {
  constructor(public code: "notJson" | "notBackup" | "tooNew") {
    super(code)
  }
}

/** Rassemble l'état actuel en une sauvegarde. */
export async function buildBackup(status: FanStatus | null, profiles: FanProfile[], prefs: Prefs): Promise<Backup> {
  let automation: AutomationConfig | null = null
  try {
    const state = await api.automation()
    automation = { enabled: state.enabled, rules: state.rules }
  } catch {
    /* contrôleur ancien, sans automatisation : la sauvegarde l'omet */
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    prefs,
    controller: {
      curve_mode: status?.curve_mode ?? "steep",
      hysteresis_c: status?.hysteresis_c ?? 0,
      smoothing: status?.smoothing ?? "normal",
      temp_filter_s: status?.temp_filter_s ?? 0,
      temp_source: status?.temp_source ?? "cpu",
      profile: status?.profile ?? "balanced",
      custom_profiles: profiles.filter((p) => p.source === "user"),
      automation,
    },
  }
}

/** Lit et valide le texte d'une sauvegarde. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("notJson")
  }
  const b = data as Partial<Backup> | null
  if (!b || b.app !== BACKUP_APP || typeof b.controller !== "object" || typeof b.prefs !== "object") throw new BackupError("notBackup")
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) throw new BackupError("tooNew")
  return b as Backup
}

/**
 * Ne garde d'une section de préférences que les clés connues, avec le bon type : un fichier modifié à la main ou venu d'une
 * autre version ne peut pas introduire de valeur inattendue.
 */
function pickKnown<T extends object>(defaults: T, incoming: unknown): Partial<T> {
  const out: Partial<T> = {}
  if (!incoming || typeof incoming !== "object") return out
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = (incoming as Record<string, unknown>)[key as string]
    if (typeof value === typeof defaults[key]) out[key] = value as T[keyof T]
  }
  return out
}

/** Ce qui a été restauré, et ce qui a échoué. */
export interface ApplyResult {
  profiles: number
  rules: number
  errors: string[]
}

/**
 * Restaure une sauvegarde. Les profils existants du même identifiant sont remplacés ; les profils du système ne sont
 * jamais touchés. Chaque étape est indépendante : une erreur sur l'une n'empêche pas les autres, et elle est rapportée.
 * IMPORTANT : l'état du second ventilateur n'est pas restauré (voir buildBackup) : le rétablir changerait le mode de
 * pilotage du matériel sans que l'utilisateur l'ait demandé.
 */
export async function applyBackup(b: Backup, fan: Fan): Promise<ApplyResult> {
  const result: ApplyResult = { profiles: 0, rules: 0, errors: [] }
  const attempt = async (label: string, fn: () => Promise<unknown> | unknown) => {
    try {
      await fn()
    } catch (e) {
      result.errors.push(`${label} : ${(e as Error).message}`)
    }
  }

  updatePrefs("alerts", pickKnown(DEFAULT_PREFS.alerts, b.prefs.alerts))
  updatePrefs("shortcuts", pickKnown(DEFAULT_PREFS.shortcuts, b.prefs.shortcuts))
  updatePrefs("widget", pickKnown(DEFAULT_PREFS.widget, b.prefs.widget))
  updatePrefs("app", pickKnown(DEFAULT_PREFS.app, b.prefs.app))

  const c = b.controller
  if (c.curve_mode === "steep" || c.curve_mode === "smooth") await attempt("curve_mode", () => fan.setCurveMode(c.curve_mode))
  await attempt("tuning", () => fan.setTuning({ hysteresis_c: c.hysteresis_c, smoothing: c.smoothing, temp_filter_s: c.temp_filter_s }))
  if (c.temp_source === "cpu" || c.temp_source === "max") await attempt("temp_source", () => fan.setTempSource(c.temp_source))

  for (const p of Array.isArray(c.custom_profiles) ? c.custom_profiles : []) {
    if (!p || typeof p.id !== "string" || !Array.isArray(p.points)) continue
    await attempt(`profil ${p.name}`, async () => {
      await fan.saveProfile({ ...p, source: "user" })
      result.profiles++
    })
  }
  if (c.automation && Array.isArray(c.automation.rules)) {
    await attempt("automation", async () => {
      await api.saveAutomation({ enabled: !!c.automation?.enabled, rules: c.automation?.rules ?? [] })
      result.rules = c.automation?.rules.length ?? 0
    })
  }
  if (c.profile) await attempt("profile", () => fan.selectProfile(c.profile))
  return result
}
