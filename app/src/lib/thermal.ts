import i18n from "@/i18n"

/** Couleur CSS (variable de thème) selon la température CPU. */
export function tempColor(temp: number): string {
  if (temp >= 80) return "var(--hot)"
  if (temp >= 65) return "var(--warm)"
  return "var(--cool)"
}

/** Libellé traduit du niveau de température (suit la langue courante au moment de l'appel). */
export function tempLabel(temp: number): string {
  if (temp >= 80) return i18n.t("common.temp.critical")
  if (temp >= 65) return i18n.t("common.temp.hot")
  if (temp >= 50) return i18n.t("common.temp.warm")
  return i18n.t("common.temp.cool")
}
