import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { resources as sources } from "@/i18n/resources"

export type Language = "fr" | "en" | "es" | "de" | "pt" | "it"

/** Langues proposées, dans l'ordre du sélecteur ; `name` est écrit dans sa propre langue (on le reconnaît même sans la lire). */
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
]
const isLanguage = (v: unknown): v is Language => LANGUAGES.some((l) => l.code === v)
const STORAGE_KEY = "fancontroller:language"

/**
 * Langue au démarrage : le choix mémorisé, sinon celle de Windows (français si le système est en français, anglais pour
 * toute autre langue). IMPORTANT : lue de façon synchrone avant le premier rendu, pour que la page ne clignote pas d'une
 * langue à l'autre.
 */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    /* stockage indisponible : on retombe sur la langue du système */
  }
  const system = navigator.language?.toLowerCase().slice(0, 2)
  return isLanguage(system) ? system : "en"
}

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(sources).map(([lang, translation]) => [lang, { translation }])),
  lng: initialLanguage(),
  // Une clé manquante s'affiche dans une langue de repli plutôt que sous forme de clé brute : l'anglais pour les langues
  // ajoutées, le français pour le reste.
  fallbackLng: { es: ["en", "fr"], de: ["en", "fr"], pt: ["en", "fr"], it: ["en", "fr"], default: ["fr"] },
  interpolation: { escapeValue: false }, // React échappe déjà
  returnNull: false,
})
document.documentElement.lang = i18n.language

// Le mini-widget est une autre fenêtre : quand la langue change dans la principale, l'événement « storage » l'en informe.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY && isLanguage(e.newValue) && e.newValue !== i18n.language) {
    void i18n.changeLanguage(e.newValue)
    document.documentElement.lang = e.newValue
  }
})

/** Change de langue et la mémorise. */
export function setLanguage(lng: Language) {
  void i18n.changeLanguage(lng)
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    /* stockage indisponible : le choix vaut pour cette session seulement */
  }
}

export default i18n
