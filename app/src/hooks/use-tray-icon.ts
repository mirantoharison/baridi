import { useEffect, useRef } from "react"
import i18n from "@/i18n"
import { call, isTauri } from "@/lib/tauri"
import type { FanStatus } from "@/lib/api"

/** Taille de l'icône envoyée : Windows la réduit à 16 ou 20 px selon l'écran, 32 reste net partout. */
const SIZE = 32
/** Couleurs de la barre sous le chiffre, alignées sur la jauge (bleu < 65°, orange < 80°, rouge au-delà). */
const COOL = "#5b9bd5"
const WARM = "#e0a040"
const HOT = "#e05a4f"
const OFFLINE = "#6b7280"

function barColor(temp: number): string {
  if (temp >= 80) return HOT
  if (temp >= 65) return WARM
  return COOL
}

/** Dessine la température sur un fond sombre, avec une barre de couleur en bas ; renvoie les pixels RGBA bruts. */
function drawIcon(label: string, color: string): number[] {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#1c1f24"
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = color
  ctx.fillRect(0, SIZE - 5, SIZE, 5)
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  // Deux chiffres tiennent à 22 px ; « -- » (contrôleur injoignable) aussi.
  ctx.font = `700 ${label.length > 2 ? 17 : 22}px "Segoe UI", sans-serif`
  ctx.fillText(label, SIZE / 2, (SIZE - 5) / 2 + 1)
  return Array.from(ctx.getImageData(0, 0, SIZE, SIZE).data)
}

/**
 * Affiche la température du processeur dans l'icône de la zone de notification, et un résumé en infobulle. La webview
 * reste vivante quand la fenêtre est masquée : l'icône continue donc de se mettre à jour fenêtre fermée.
 *
 * IMPORTANT : l'icône n'est renvoyée à Rust que si le chiffre ou la couleur change, pas à chaque seconde.
 */
export function useTrayIcon(status: FanStatus | null, online: boolean) {
  const lastRef = useRef("")

  // Menu de l'icône (« Afficher » / « Quitter ») : retraduit au démarrage et à chaque changement de langue.
  useEffect(() => {
    if (!isTauri) return
    call("set_tray_menu", { show: i18n.t("common.tray.show"), quit: i18n.t("common.tray.quit") }).catch(() => {})
  }, [i18n.language])

  const temp = status?.temp_c
  const profile = status?.profile
  const rpm = status?.rpm
  const battery = status?.battery
  const batteryText = battery ? `${battery.percent} %${battery.plugged_in ? ` ${i18n.t("common.tray.ac")}` : ""}` : ""

  useEffect(() => {
    if (!isTauri) return
    const hasTemp = online && temp !== undefined && temp > 0
    const label = hasTemp ? String(temp) : "--"
    const color = hasTemp ? barColor(temp) : OFFLINE
    const t = i18n.t.bind(i18n)
    const name = t("common.appName")
    const tooltip = hasTemp
      ? `${name}\n${t("common.tray.tooltip", { temp, rpm: rpm ?? 0, profile: profile ?? "?" })}${batteryText ? `\n${t("common.tray.battery", { value: batteryText })}` : ""}`
      : `${name}\n${t("common.tray.unreachable")}`
    const key = `${label}|${color}|${tooltip}`
    if (key === lastRef.current) return
    lastRef.current = key
    call("set_tray", { rgba: drawIcon(label, color), width: SIZE, height: SIZE, tooltip }).catch(() => {
      lastRef.current = "" // échec : on réessaiera au prochain changement
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la langue fait partie de la clé de mise en cache ci-dessus
  }, [online, temp, rpm, profile, batteryText, i18n.language])
}
