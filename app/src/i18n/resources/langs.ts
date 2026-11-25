import { de } from "@/i18n/resources/lang/de"
import { pt } from "@/i18n/resources/lang/pt"
import { it } from "@/i18n/resources/lang/it"
import { es } from "@/i18n/resources/lang/es"

/**
 * Langues supplémentaires : un fichier par langue (resources/lang/<code>.ts), qui reprend la même arborescence que le
 * français. Une clé absente d'une langue s'affiche en anglais (puis en français), jamais sous forme de clé brute.
 */
export const extraLanguages: Record<string, Record<string, unknown>> = { es, de, pt, it }
