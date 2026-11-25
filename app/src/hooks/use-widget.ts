import { useEffect } from "react"
import { emit, listen } from "@tauri-apps/api/event"
import { WIDGET_CLOSED_EVENT, WIDGET_POSITION_KEY, WIDGET_SETTINGS_EVENT } from "@/components/widget-view"
import { updatePrefs, usePrefs } from "@/lib/prefs"
import { call, isTauri } from "@/lib/tauri"

/** Dernière position connue du widget (écrite par la fenêtre du widget quand on le déplace). */
function savedPosition(): { x?: number; y?: number } {
  try {
    const p = JSON.parse(localStorage.getItem(WIDGET_POSITION_KEY) ?? "null")
    if (typeof p?.x === "number" && typeof p?.y === "number") return { x: p.x, y: p.y }
  } catch {
    /* position illisible : emplacement par défaut */
  }
  return {}
}

/**
 * Garde le mini-widget aligné sur les réglages : il apparaît (à sa dernière position) au démarrage si le réglage est actif,
 * disparaît quand on le coupe, passe en « clic traversant » à la demande, et reçoit son opacité par un événement. La croix
 * du widget lui-même coupe le réglage (événement émis par le widget).
 */
export function useWidget() {
  const { widget } = usePrefs()

  useEffect(() => {
    if (!isTauri) return
    call("set_widget_visible", { visible: widget.enabled, ...savedPosition() })
      .then(() => call("set_widget_click_through", { enabled: widget.enabled && widget.clickThrough }))
      .catch(() => {})
  }, [widget.enabled, widget.clickThrough])

  useEffect(() => {
    if (!isTauri) return
    emit(WIDGET_SETTINGS_EVENT, { opacity: widget.opacity }).catch(() => {})
  }, [widget.opacity, widget.enabled])

  useEffect(() => {
    if (!isTauri) return
    const unlisten = listen(WIDGET_CLOSED_EVENT, () => updatePrefs("widget", { enabled: false }))
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])
}
