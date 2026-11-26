import { useSyncExternalStore } from "react"
import { LazyStore } from "@tauri-apps/plugin-store"
import { isTauri } from "@/lib/tauri"

/** Alertes thermiques : seuils en °C, alignés sur la jauge (« Critique » à partir de 80°). */
export interface AlertPrefs {
  enabled: boolean
  warnTemp: number
  criticalTemp: number
  /** Prévient quand le contrôleur ne répond plus : le ventilateur reste alors figé sur sa dernière consigne. */
  notifyDisconnect: boolean
  /** Prévient quand un ventilateur ne tourne pas alors qu'il reçoit une consigne (bloqué, débranché ou capteur mort). */
  notifyFanStall: boolean
  /** Alertes de la carte graphique : seuils propres (elle supporte des températures plus hautes que le processeur). */
  gpuEnabled: boolean
  gpuWarnTemp: number
  gpuCriticalTemp: number
  /**
   * Date (ms depuis l'epoch) jusqu'à laquelle les alertes non critiques sont en pause ; 0 = pas de pause.
   * IMPORTANT : l'alerte « critique » n'est JAMAIS mise en pause — c'est la seule qui protège la machine.
   */
  snoozeUntil: number
}

/** Raccourcis globaux, au format « accelerator » Tauri (ex. Ctrl+Alt+P). */
export interface ShortcutPrefs {
  enabled: boolean
  nextProfile: string
  toggleFull: string
  /** Affiche ou masque le mini-widget ; bascule son mode « clic traversant ». */
  toggleWidget: string
  toggleClickThrough: string
  /** Vitesses fixes : une combinaison par palier (10, 25, 50 et 75 %), qui passe en Manuel à cette vitesse. */
  speed10: string
  speed25: string
  speed50: string
  speed75: string
}

/** Mini-widget flottant (seconde fenêtre toujours visible). */
export interface WidgetPrefs {
  enabled: boolean
  /** Opacité au repos, en % (30, 55 ou 80) : le widget redevient net au survol. */
  opacity: number
  /** Le widget ignore la souris : les clics passent à la fenêtre qui est dessous. */
  clickThrough: boolean
}

/** Comportement de la fenêtre principale. */
export interface AppPrefs {
  /** Réduire la fenêtre la retire de la barre des tâches : elle ne reste que dans la zone de notification. */
  minimizeToTray: boolean
}

export interface Prefs {
  app: AppPrefs
  alerts: AlertPrefs
  shortcuts: ShortcutPrefs
  widget: WidgetPrefs
}

export const DEFAULT_PREFS: Prefs = {
  app: { minimizeToTray: true },
  alerts: { enabled: true, warnTemp: 70, criticalTemp: 80, notifyDisconnect: true, notifyFanStall: true, gpuEnabled: true, gpuWarnTemp: 80, gpuCriticalTemp: 87, snoozeUntil: 0 },
  shortcuts: { enabled: false, nextProfile: "Ctrl+Alt+P", toggleFull: "Ctrl+Alt+F", toggleWidget: "Ctrl+Shift+F5", toggleClickThrough: "Ctrl+Shift+F6", speed10: "Ctrl+Shift+F1", speed25: "Ctrl+Shift+F2", speed50: "Ctrl+Shift+F3", speed75: "Ctrl+Shift+F4" },
  widget: { enabled: false, opacity: 55, clickThrough: false },
}

const STORE_FILE = "prefs.json"
const STORE_KEY = "prefs"
/** Repli hors Tauri (navigateur de dev) : le plugin store n'existe que dans la fenêtre native. */
const LOCAL_KEY = "fancontroller:prefs"

// IMPORTANT : fichier dans %APPDATA%\<identifier>\, donc épargné par le vidage du cache de la webview
// (contrairement au localStorage). autoSave regroupe les écritures rapprochées (curseurs, saisie).
const store = isTauri ? new LazyStore(STORE_FILE, { autoSave: 300, defaults: {} }) : null

/**
 * Combinaisons proposées par les versions précédentes pour les vitesses fixes. Sur la machine de développement,
 * Ctrl+Alt+1/2 puis Ctrl+Alt+Shift+1 ne déclenchaient rien : les chiffres du haut sont captés ailleurs (le raccourci
 * était enregistré mais l'appui n'arrivait jamais). Une valeur encore égale à un ancien défaut a pu être enregistrée telle
 * quelle dans le fichier de préférences : on la remplace. Une combinaison choisie par l'utilisateur n'est jamais touchée.
 */
const OLD_SPEED_DEFAULTS: Record<"speed10" | "speed25" | "speed50" | "speed75", string[]> = {
  speed10: ["Ctrl+Alt+1", "Ctrl+Alt+Shift+1"],
  speed25: ["Ctrl+Alt+2", "Ctrl+Alt+Shift+2"],
  speed50: ["Ctrl+Alt+3", "Ctrl+Alt+Shift+3"],
  speed75: ["Ctrl+Alt+4", "Ctrl+Alt+Shift+4"],
}

/** Fusion profonde limitée à deux niveaux : une version future peut ajouter des clés sans casser un fichier ancien. */
function withDefaults(raw: Partial<Prefs> | null | undefined): Prefs {
  return {
    alerts: { ...DEFAULT_PREFS.alerts, ...raw?.alerts },
    shortcuts: migrateSpeedShortcuts({ ...DEFAULT_PREFS.shortcuts, ...raw?.shortcuts }),
    widget: { ...DEFAULT_PREFS.widget, ...raw?.widget },
    app: { ...DEFAULT_PREFS.app, ...raw?.app },
  }
}

function migrateSpeedShortcuts(s: ShortcutPrefs): ShortcutPrefs {
  const out = { ...s }
  for (const key of ["speed10", "speed25", "speed50", "speed75"] as const) {
    if (OLD_SPEED_DEFAULTS[key].includes(out[key])) out[key] = DEFAULT_PREFS.shortcuts[key]
  }
  return out
}

let current: Prefs = DEFAULT_PREFS
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

async function readStored(): Promise<Partial<Prefs> | null> {
  if (store) return (await store.get<Partial<Prefs>>(STORE_KEY)) ?? null
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null")
  } catch {
    return null
  }
}

async function writeStored(prefs: Prefs) {
  if (store) {
    await store.set(STORE_KEY, prefs)
  } else {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs))
    } catch {
      /* stockage indisponible : les préférences valent pour cette session seulement */
    }
  }
}

/** Charge les préférences une fois au démarrage ; avant la fin du chargement, les valeurs par défaut s'appliquent. */
readStored()
  .then((raw) => {
    current = withDefaults(raw)
    emit()
  })
  .catch(() => {
    /* fichier illisible : on garde les valeurs par défaut plutôt que de bloquer l'interface */
  })

/** Modifie une section et la persiste. Les composants abonnés se mettent à jour immédiatement. */
export function updatePrefs<K extends keyof Prefs>(section: K, patch: Partial<Prefs[K]>) {
  current = { ...current, [section]: { ...current[section], ...patch } }
  emit()
  writeStored(current).catch(() => {
    /* échec d'écriture : la valeur reste appliquée en mémoire, elle sera perdue au prochain lancement */
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Préférences courantes, partagées entre tous les composants (un seul état, pas une copie par appelant). */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => current)
}
