import { forgetApiKey, getApiKey } from "@/lib/api-key"
import { requestLog } from "@/lib/request-log"

// IMPORTANT : le sidecar Go n'écoute que sur loopback, port fixe partagé avec src-tauri.
export const BASE_URL = "http://127.0.0.1:8787"

export type FanMode = "auto" | "manual" | "idle"
export type Smoothing = "fast" | "normal" | "slow"

export interface FanStatus {
  mode: FanMode
  profile: string
  curve_mode: "steep" | "smooth"
  // IMPORTANT : optionnels — un contrôleur plus ancien (service déjà installé) ne les envoie pas.
  hysteresis_c?: number
  smoothing?: Smoothing
  temp_filter_s?: number
  /** Nombre de ventilateurs annoncé par la DLL ASUS (-1 = elle ne le dit pas). Absent sur un contrôleur ancien. */
  fan_count?: number
  temp_c: number
  rpm: number
  pwm: number
  percent: number
  /** Vitesse du second ventilateur. Absent si la DLL n'annonce pas deux ventilateurs. */
  fan2_rpm?: number
  /** Comment le second ventilateur est piloté (POST /fan/fan2). Présent seulement avec fan2_rpm. */
  fan2_mode?: Fan2Mode
  /** Consigne du mode manuel, en %. */
  fan2_percent?: number
  /** État du processeur et de la carte graphique NVIDIA. `gpu` est absent sans carte NVIDIA ; les deux le sont avec un contrôleur ancien. */
  cpu?: CpuStatus
  gpu?: GpuStatus
  ram?: RamStatus
  battery?: BatteryStatus
  sensors?: ExtraSensors
  /** Température qui pilote la courbe du ventilateur 1 : « cpu » (défaut) ou « max » (la plus haute du CPU et de la GPU). */
  temp_source?: TempSource
  /** Courbe propre du second ventilateur, présente une fois définie. */
  fan2_curve?: Fan2Curve
  battery_details?: BatteryDetails
  /** Autonomie estimée en minutes, d'après la consommation moyenne des 10 dernières minutes (absente branchée). */
  battery_eta_min?: number
  /**
   * Vrai quand le firmware pilote les DEUX ventilateurs et que la courbe du profil est ignorée : cela arrive en revenant
   * au mode « firmware » après avoir commandé le ventilateur 2 (le mode test de la DLL est coupé pour les deux).
   */
  bios_override?: boolean
}

/** Processeur : charge mesurée sur les deux derniers relevés, fréquence réelle estimée (turbo compris). */
export interface CpuStatus {
  name: string
  threads: number
  base_mhz: number
  freq_mhz: number
  usage_percent: number
  /** Charge de chaque thread logique, en %. Vide au tout premier relevé. */
  cores?: number[]
  /** Limitation probable : fréquence nettement sous la base alors que le processeur est chargé (déduction, pas une lecture directe). */
  throttled: boolean
  /** Fréquence estimée de chaque thread, en MHz, dans le même ordre que `cores`. */
  core_freq_mhz?: number[]
}

/** Carte graphique NVIDIA, lue via NVML. Un champ que le pilote ne donne pas reste à 0. */
export interface GpuStatus {
  name: string
  temp_c: number
  usage_percent: number
  mem_used_mb: number
  mem_total_mb: number
  power_w: number
  clock_mhz: number
  mem_clock_mhz: number
  /** Plafond de puissance appliqué par le pilote, en W (absent si non communiqué). */
  power_limit_w?: number
  /** Vitesse du ventilateur PROPRE de la carte, si le modèle l'expose (rare sur portable). */
  fan_percent?: number
  /** État de performance : 0 = maximum, 15 = repos, -1 = inconnu. */
  pstate: number
  pcie_gen?: number
  pcie_width?: number
  driver?: string
  /**
   * Raisons du ralentissement en cours. Seul « hw_thermal » est une vraie protection de la puce ; « sw_thermal » est le
   * plafond thermique de la plateforme, que les portables déclarent en permanence (même à 50 °C).
   */
  throttle?: ("hw_thermal" | "sw_thermal" | "power" | "hw_slowdown")[]
  /** État d'alimentation Windows de la carte : D0 = allumée, D3 = veille profonde. */
  power_state?: string
  /** La carte dort : aucune mesure n'a été faite (la demander la réveillerait), les autres champs sont vides. */
  asleep?: boolean
  /** Mode graphique déduit des cartes présentes : hybride (Optimus), dédié (NVIDIA seule) ou intégré. */
  mode?: "hybrid" | "discrete" | "integrated"
  /** Programmes qui utilisent la carte, quand le pilote les indique. */
  processes?: string[]
}

/** Mémoire vive. */
export interface RamStatus {
  total_mb: number
  used_mb: number
  usage_percent: number
}

/** Batterie ; absente du statut sur une machine sans batterie. `minutes_left` vaut -1 si inconnue. */
export interface BatteryStatus {
  present: boolean
  percent: number
  plugged_in: boolean
  charging: boolean
  minutes_left: number
}

/**
 * Capteurs supplémentaires de la DLL ASUS, lus lentement et seulement si le modèle les gère (0 = absent, donc omis).
 * La puissance et la tension du processeur sont BRUTES : leur unité n'est pas documentée.
 */
export interface ExtraSensors {
  board_left_c?: number
  board_right_c?: number
  gpu_left_c?: number
  gpu_right_c?: number
  gpu_vram_c?: number
  gpu_vrm_c?: number
  up_cpu_c?: number
  cpu_power_raw?: number
  cpu_voltage_raw?: number
  /** Limites de puissance du processeur (DPTF), lecture seule, valeurs brutes. */
  pl1_raw?: number
  pl2_raw?: number
  /** Cycles de charge lus dans le contrôleur embarqué de la batterie. */
  battery_cycles?: number
}

/** Plan d'alimentation Windows : le plan actif et les plans standard installés (GET /power-plan). */
export interface PowerPlanState {
  active: string
  available: string[]
}

export type TempSource = "cpu" | "max"

/** Température qui pilote la courbe du second ventilateur : processeur, carte graphique ou la plus haute des deux. */
export type Fan2Source = "cpu" | "gpu" | "max"

export interface Fan2Curve {
  points: CurvePoint[]
  source: Fan2Source
}

/** Batterie vue par le pilote Windows : usure, cycles, tension et puissance instantanée (positive en charge). */
export interface BatteryDetails {
  designed_mwh: number
  full_charged_mwh: number
  capacity_mwh: number
  wear_percent: number
  cycle_count: number
  voltage_mv: number
  power_w: number
  has_power: boolean
  chemistry?: string
}

/** Mesure de l'historique long (GET /history). Un champ absent = non mesuré à cet instant. */
export interface HistorySample {
  /** Secondes Unix. */
  t: number
  temp?: number
  pct?: number
  rpm?: number
  rpm2?: number
  cpu?: number
  gpu_t?: number
  gpu_u?: number
  gpu_w?: number
  bat?: number
  bat_w?: number
  ac?: boolean
}

/** Progression et résultat du test actif des ventilateurs (GET /diagnostic/fan-test). */
export interface FanTestState {
  status: "idle" | "running" | "done" | "aborted" | "failed"
  step: number
  total: number
  steps: { percent: number; rpm1: number; rpm2: number }[]
  verdict1?: "ok" | "weak" | "stuck" | "dead"
  verdict2?: "ok" | "weak" | "stuck" | "dead"
  message?: string
}

/** Résumé des dernières 24 heures (GET /history/summary). */
export interface DaySummary {
  samples: number
  covered_hours: number
  avg_temp_c: number
  max_temp_c: number
  minutes_above_70: number
  minutes_high_load: number
  max_gpu_temp_c: number
  battery_used_wh: number
  battery_charged_wh: number
  minutes_on_battery: number
}

/** Diagnostic d'encrassement (GET /history/analysis). */
export interface Fouling {
  status: "insufficient" | "ok" | "watch" | "clean"
  days_covered: number
  drop_percent: number
  buckets: number
}

/** Statistiques de session du contrôleur (GET /stats) : remises à zéro à son redémarrage. */
export interface SessionStats {
  uptime_s: number
  samples: number
  min_temp_c: number
  max_temp_c: number
  avg_temp_c: number
  seconds_above_70: number
  seconds_above_80: number
  seconds_above_90: number
  max_rpm: number
}

/** Identité de la machine (GET /system). */
export interface SystemInfo {
  manufacturer: string
  model: string
  bios_version: string
  bios_date: string
  power_plan: string
  uptime_s: number
}

export type AutomationTrigger = "process" | "power_source" | "power_plan" | "battery_below"

/** Règle d'automatisation : quand le déclencheur est vrai, le profil est appliqué. L'ordre des règles est leur priorité. */
export interface AutomationRule {
  id: string
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  /** process : nom de l'exécutable ; power_source : « ac » ou « battery » ; power_plan : nom du plan. */
  value: string
  profile: string
  /** Plan d'alimentation Windows à poser en plus du profil (absent = ne pas y toucher). */
  plan?: string
}

export interface AutomationConfig {
  enabled: boolean
  rules: AutomationRule[]
}

/** Configuration + ce que le moteur observe (GET /automation). */
export interface AutomationState extends AutomationConfig {
  active_rule_id: string
  base_profile: string
  on_battery: boolean
  battery_percent: number
  power_plan: string
  plans: string[]
}

/** Programme proposé dans une règle : `name` est le nom d'exécutable en minuscules ; `running` = il tourne en ce moment. */
export interface AppEntry {
  name: string
  running: boolean
}

/** « firmware » = comportement d'origine, « follow » = même consigne que le ventilateur 1, « manual » = consigne fixe. */
export type Fan2Mode = "firmware" | "follow" | "manual" | "curve"

/** Consigne manuelle minimale acceptée par le contrôleur pour le second ventilateur (fan2MinManualPercent côté Go). */
export const FAN2_MIN_MANUAL_PERCENT = 20

/** Réglages fins du mode Auto : tous les champs sont optionnels (POST /fan/tuning). */
export interface TuningPatch {
  hysteresis_c?: number
  smoothing?: Smoothing
  temp_filter_s?: number
}

/** Identité du contrôleur (GET /info). */
export interface ControllerInfo {
  version: string
  pid: number
  uptime_s: number
  dir: string
  settings_path: string
  profiles_path: string
  /** true = service Windows, false = lancé par l'application. */
  service: boolean
  /** Nombre de ventilateurs annoncé par la DLL (-1 = inconnu). Absent sur un contrôleur ancien. */
  fan_count?: number
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

/**
 * Options d'une requête : `quiet` = ne pas consigner les SUCCÈS dans le journal. Réservé aux lectures qui se répètent
 * (statistiques, identité de la machine) : sans cela, elles noieraient les actions utiles en quelques minutes, comme le
 * feraient les mesures reçues chaque seconde. Un échec est toujours consigné.
 */
type RequestOptions = RequestInit & { quiet?: boolean }

/** Toute requête vers le contrôleur passe par ici : elle est journalisée (méthode, chemin, corps, statut, durée). */
async function request<T>(path: string, init?: RequestOptions, retried = false): Promise<T> {
  const method = init?.method ?? "GET"
  const body = typeof init?.body === "string" ? init.body : undefined
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  let res: Response
  try {
    // La clé vient du fichier du contrôleur ; elle est lue une fois puis mémorisée (voir api-key.ts).
    const key = await getApiKey()
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    })
  } catch (e) {
    requestLog.add({ method, path, body, status: "ERR", ms: elapsed(), error: (e as Error).message })
    throw e
  }
  // Le corps est lu en texte puis analysé à la main : une même lecture sert au journal (détails d'une ligne) et à l'appelant.
  const text = await res.text().catch(() => "")
  if (!res.ok) {
    let err: { error?: string } = {}
    try {
      err = JSON.parse(text)
    } catch {
      /* corps non JSON : on retombe sur le message générique */
    }
    const message = err.error ?? `${method} ${path}: ${res.status}`
    requestLog.add({ method, path, body, status: res.status, ms: elapsed(), error: message, response: clipForLog(text) })
    // 401 : la clé mémorisée n'est plus la bonne (contrôleur réinstallé, fichier régénéré). On la relit et on réessaie UNE fois.
    if (res.status === 401 && !retried) {
      forgetApiKey()
      return request<T>(path, init, true)
    }
    throw new Error(message)
  }
  if (!init?.quiet) {
    requestLog.add({ method, path, body, status: res.status, ms: elapsed(), response: clipForLog(text) })
  }
  return JSON.parse(text)
}

/** Taille maximale d'une réponse conservée dans le journal : 500 lignes × 2000 caractères restent loin du quota du localStorage. */
const MAX_LOGGED_RESPONSE_CHARS = 2000

function clipForLog(text: string): string | undefined {
  if (!text) return undefined
  return text.length > MAX_LOGGED_RESPONSE_CHARS ? `${text.slice(0, MAX_LOGGED_RESPONSE_CHARS)}… (tronqué)` : text
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  status: () => request<FanStatus>("/status"),
  manual: (percent: number) => post<FanStatus>("/fan/manual", { percent }),
  auto: () => post<FanStatus>("/fan/auto"),
  stop: () => post<FanStatus>("/fan/stop"),
  setCurveMode: (mode: "steep" | "smooth") => post<FanStatus>("/fan/curve-mode", { mode }),
  setTuning: (patch: TuningPatch) => post<FanStatus>("/fan/tuning", patch),
  setFan2: (mode: Fan2Mode, percent?: number) => post<FanStatus>("/fan/fan2", { mode, percent }),
  setFan2Curve: (curve: Fan2Curve) => post<FanStatus>("/fan/fan2", { mode: "curve", curve: curve.points, source: curve.source }),
  setTempSource: (source: TempSource) => post<FanStatus>("/fan/temp-source", { source }),
  history: async (hours: number, points = 240) =>
    (await request<{ samples: HistorySample[] }>(`/history?hours=${hours}&points=${points}`, { quiet: true })).samples,
  powerPlan: () => request<PowerPlanState>("/power-plan", { quiet: true }),
  setPowerPlan: (plan: string) => post<PowerPlanState>("/power-plan", { plan }),
  // Le contrôleur envoie `steps: null` tant qu'aucun test n'a tourné : on normalise pour que l'interface lise toujours un tableau.
  fanTest: async () => {
    const s = await request<FanTestState>("/diagnostic/fan-test", { quiet: true })
    return { ...s, steps: s.steps ?? [] }
  },
  startFanTest: async () => {
    const s = await post<FanTestState>("/diagnostic/fan-test")
    return { ...s, steps: s.steps ?? [] }
  },
  summary: () => request<DaySummary>("/history/summary", { quiet: true }),
  fouling: () => request<Fouling>("/history/analysis", { quiet: true }),
  info: () => request<ControllerInfo>("/info"),
  stats: () => request<SessionStats>("/stats", { quiet: true }),
  system: () => request<SystemInfo>("/system", { quiet: true }),
  automation: () => request<AutomationState>("/automation", { quiet: true }),
  saveAutomation: (cfg: AutomationConfig) => post<AutomationState>("/automation", cfg),
  automationApps: async () => (await request<{ apps: AppEntry[] }>("/automation/apps", { quiet: true })).apps,
  setProfile: (profile: string) => post<FanStatus>("/fan/profile", { profile }),
  profiles: async () => (await request<{ profiles: FanProfile[] }>("/fan/profiles")).profiles,
  saveProfile: (p: FanProfile) => post<FanProfile>("/fan/profiles", p),
  deleteProfile: (id: string) => request<{ deleted: string }>(`/fan/profiles/${id}`, { method: "DELETE" }),
}

// Icônes des programmes : une <img> ne peut pas envoyer l'en-tête Authorization, on les télécharge donc avec fetch puis on
// les expose en URL locale. Mémorisées pour la durée de la fenêtre (le contrôleur, lui, les garde sur disque).
const iconCache = new Map<string, Promise<string | null>>()

/** URL locale de l'icône d'un programme, ou null s'il n'en a pas (le contrôleur répond 404). */
export function fetchAppIcon(name: string): Promise<string | null> {
  let cached = iconCache.get(name)
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/automation/icon?name=${encodeURIComponent(name)}`, {
          headers: { Authorization: `Bearer ${await getApiKey()}` },
        })
        return res.ok ? URL.createObjectURL(await res.blob()) : null
      } catch {
        iconCache.delete(name) // échec réseau : on réessaiera à la prochaine demande
        return null
      }
    })()
    iconCache.set(name, cached)
  }
  return cached
}
