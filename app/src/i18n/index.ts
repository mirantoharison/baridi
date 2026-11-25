import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { resources as sources } from "@/i18n/resources"

export type Language = "fr" | "en"

export const LANGUAGES: Language[] = ["fr", "en"]
const STORAGE_KEY = "fancontroller:language"

/**
 * Langue au démarrage : le choix mémorisé, sinon celle de Windows (français si le système est en français, anglais pour
 * toute autre langue). IMPORTANT : lue de façon synchrone avant le premier rendu, pour que la page ne clignote pas d'une
 * langue à l'autre.
 */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "fr" || saved === "en") return saved
  } catch {
    /* stockage indisponible : on retombe sur la langue du système */
  }
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en"
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: sources.fr },
    en: { translation: sources.en },
  },
  lng: initialLanguage(),
  fallbackLng: "fr", // une clé manquante en anglais s'affiche en français plutôt que sous forme de clé brute
  interpolation: { escapeValue: false }, // React échappe déjà
  returnNull: false,
})
document.documentElement.lang = i18n.language

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
