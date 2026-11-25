import { common } from "@/i18n/resources/common"
import { history } from "@/i18n/resources/history"
import { control } from "@/i18n/resources/control"
import { profiles } from "@/i18n/resources/profiles"
import { settings } from "@/i18n/resources/settings"
import { config } from "@/i18n/resources/config"
import { automation } from "@/i18n/resources/automation"
import { diagnostic } from "@/i18n/resources/diagnostic"
import { logs } from "@/i18n/resources/logs"
import { about } from "@/i18n/resources/about"
import { widget } from "@/i18n/resources/widget"
import { extraLanguages } from "@/i18n/resources/langs"
import { backup } from "@/i18n/resources/backup"
import { reports } from "@/i18n/resources/reports"
import { sensors } from "@/i18n/resources/sensors"
import { gpu } from "@/i18n/resources/gpu"
import { energy } from "@/i18n/resources/energy"
import { help } from "@/i18n/resources/help"
import { info } from "@/i18n/resources/info"
import { hardware } from "@/i18n/resources/hardware"

/** Assemble les textes de chaque fonctionnalité : un fichier par domaine, français et anglais côte à côte. */
const modules = { common, hardware, info, history, control, profiles, settings, config, automation, diagnostic, logs, about, widget, backup, reports, sensors, gpu, energy, help }

type Lang = "fr" | "en"
const base = Object.fromEntries(
  (["fr", "en"] as Lang[]).map((lang) => [lang, Object.fromEntries(Object.entries(modules).map(([k, v]) => [k, v[lang]]))]),
) as Record<Lang, Record<string, unknown>>

/** Français et anglais (complets, un fichier par domaine) plus les langues ajoutées ensuite (voir langs.ts). */
export const resources: Record<string, Record<string, unknown>> = { ...base, ...extraLanguages }
