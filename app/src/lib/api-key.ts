import i18n from "@/i18n"
import { call, isTauri } from "@/lib/tauri"

/**
 * Clé d'API partagée avec le contrôleur : toutes ses routes (sauf /health) la réclament.
 *
 * Dans l'application, elle vient de la commande Rust `api_key`, qui lit le fichier `api.key` du contrôleur (réservé à
 * SYSTEM et aux administrateurs). Dans un navigateur de développement (pas de Tauri), on la lit dans le localStorage
 * sous DEV_KEY : à coller à la main depuis `api.key`, c'est volontairement un geste explicite.
 */
const DEV_KEY = "fancontroller:api-key"

/** Le contrôleur crée la clé à son démarrage : l'interface, lancée en premier, doit patienter un peu. */
const KEY_RETRIES = 40
const KEY_RETRY_DELAY_MS = 500

let cached: string | null = null
let pending: Promise<string> | null = null

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readKey(): Promise<string> {
  if (!isTauri) {
    const key = localStorage.getItem(DEV_KEY)
    if (key) return key
    throw new Error(i18n.t("common.errors.keyMissing", { key: DEV_KEY }))
  }
  let lastError = ""
  for (let attempt = 0; attempt < KEY_RETRIES; attempt++) {
    try {
      return await call<string>("api_key")
    } catch (e) {
      lastError = typeof e === "string" ? e : (e as Error).message
      await sleep(KEY_RETRY_DELAY_MS)
    }
  }
  throw new Error(lastError || i18n.t("common.errors.keyNotFound"))
}

/**
 * Renvoie la clé, en la mémorisant. Les appels simultanés partagent la même lecture (au démarrage, plusieurs
 * requêtes partent en même temps et attendraient chacune la création du fichier).
 */
export function getApiKey(): Promise<string> {
  if (cached) return Promise.resolve(cached)
  pending ??= readKey()
    .then((key) => (cached = key))
    .finally(() => {
      pending = null
    })
  return pending
}

/** Oublie la clé mémorisée : à appeler sur un refus (401), la clé a pu être régénérée (fichier supprimé, nouveau contrôleur). */
export function forgetApiKey() {
  cached = null
}
