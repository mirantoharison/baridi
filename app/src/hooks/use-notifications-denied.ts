import { useEffect, useState } from "react"
import { isPermissionGranted } from "@tauri-apps/plugin-notification"
import { isTauri } from "@/lib/tauri"

/**
 * Vrai quand Windows refuse les notifications à l'application (réglage système, mode concentration strict).
 * Relu à chaque retour de focus : l'utilisateur corrige souvent le réglage dans les paramètres Windows puis revient ici.
 * Hors Tauri (navigateur de dev) il n'y a rien à vérifier : renvoie false.
 */
export function useNotificationsDenied(): boolean {
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    let isMounted = true
    const check = () =>
      isPermissionGranted()
        .then((granted) => isMounted && setDenied(!granted))
        .catch(() => {
          /* plugin indisponible : on n'affiche pas de faux badge */
        })
    check()
    window.addEventListener("focus", check)
    return () => {
      isMounted = false
      window.removeEventListener("focus", check)
    }
  }, [])

  return denied
}
