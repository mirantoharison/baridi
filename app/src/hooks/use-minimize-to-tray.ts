import { useEffect } from "react"
import { usePrefs } from "@/lib/prefs"
import { call, isTauri } from "@/lib/tauri"

/** Transmet au shell Tauri le réglage « réduire dans la zone de notification » (au démarrage et à chaque changement). */
export function useMinimizeToTray() {
  const { app } = usePrefs()
  useEffect(() => {
    if (isTauri) call("set_minimize_to_tray", { enabled: app.minimizeToTray }).catch(() => {})
  }, [app.minimizeToTray])
}
