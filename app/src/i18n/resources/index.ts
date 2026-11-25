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
import { info } from "@/i18n/resources/info"
import { hardware } from "@/i18n/resources/hardware"

/** Assemble les textes de chaque fonctionnalité : un fichier par domaine, français et anglais côte à côte. */
const modules = { common, hardware, info, history, control, profiles, settings, config, automation, diagnostic, logs, about }

type Lang = "fr" | "en"
export const resources = Object.fromEntries(
  (["fr", "en"] as Lang[]).map((lang) => [lang, Object.fromEntries(Object.entries(modules).map(([k, v]) => [k, v[lang]]))]),
) as Record<Lang, Record<string, unknown>>
