import { useEffect, useRef } from "react"
import { listen } from "@tauri-apps/api/event"
import i18n from "@/i18n"
import { manualSpeedWarning } from "@/lib/guards"
import { call, isTauri } from "@/lib/tauri"
import type { FanProfile, FanStatus } from "@/lib/api"

/** Vitesses fixes proposées par le menu, comme les raccourcis clavier. */
const FIXED_SPEEDS = [10, 25, 50, 75]

interface Actions {
  status: FanStatus | null
  profiles: FanProfile[]
  selectProfile: (id: string) => void
  setAuto: () => void
  setManual: (percent: number) => void
}

interface TrayItem {
  id: string
  label: string
  kind: "item" | "check" | "separator" | "submenu"
  checked?: boolean
  children?: TrayItem[]
}

/** Construit le menu du clic droit sur l'icône : profils, Auto, vitesses fixes, puis Afficher et Quitter. */
function buildMenu(status: FanStatus | null, profiles: FanProfile[]): TrayItem[] {
  const t = i18n.t.bind(i18n)
  const manual = status?.mode === "manual"
  return [
    { id: "show", label: t("common.tray.show"), kind: "item" },
    { id: "sep1", label: "", kind: "separator" },
    {
      id: "profiles",
      label: t("common.tray.profile"),
      kind: "submenu",
      children: profiles.map((p) => ({ id: `profile:${p.id}`, label: p.name, kind: "check" as const, checked: p.id === status?.profile })),
    },
    { id: "auto", label: t("common.tray.auto"), kind: "check", checked: status?.mode === "auto" },
    {
      id: "speeds",
      label: t("common.tray.fixedSpeed"),
      kind: "submenu",
      children: FIXED_SPEEDS.map((n) => ({ id: `speed:${n}`, label: `${n} %`, kind: "check" as const, checked: manual && Math.abs((status?.percent ?? -99) - n) <= 2 })),
    },
    { id: "sep2", label: "", kind: "separator" },
    { id: "quit", label: t("common.tray.quit"), kind: "item" },
  ]
}

/**
 * Menu riche de l'icône de la zone de notification : changer de profil, repasser en Auto ou fixer une vitesse sans ouvrir
 * la fenêtre. Le menu est reconstruit quand le profil, le mode, la liste des profils ou la langue changent (pas à chaque
 * mesure) ; les clics reviennent par l'événement « tray-action » émis par Rust.
 *
 * IMPORTANT : comme les raccourcis clavier, une vitesse fixe trop basse pour la température du moment est ignorée plutôt
 * qu'appliquée (aucune confirmation n'est possible depuis un menu d'icône).
 */
export function useTrayMenu(actions: Actions) {
  const ref = useRef(actions)
  ref.current = actions
  const lastKey = useRef("")

  const { status, profiles } = actions
  const mode = status?.mode
  const profile = status?.profile
  const percentBucket = status?.mode === "manual" ? FIXED_SPEEDS.find((n) => Math.abs((status?.percent ?? -99) - n) <= 2) : undefined

  useEffect(() => {
    if (!isTauri) return
    const menu = buildMenu(ref.current.status, profiles)
    const key = JSON.stringify(menu)
    if (key === lastKey.current) return
    lastKey.current = key
    call("set_tray_menu", { items: menu }).catch(() => {
      lastKey.current = "" // échec : on réessaiera au prochain changement
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- le menu dépend de ces valeurs, lues dans la ref
  }, [mode, profile, percentBucket, profiles, i18n.language])

  useEffect(() => {
    if (!isTauri) return
    const unlisten = listen<string>("tray-action", (event) => {
      const id = event.payload
      const { status, selectProfile, setAuto, setManual } = ref.current
      if (id === "auto") setAuto()
      else if (id.startsWith("profile:")) selectProfile(id.slice("profile:".length))
      else if (id.startsWith("speed:")) {
        const percent = Number(id.slice("speed:".length))
        if (status && manualSpeedWarning(status.temp_c, percent)) return
        setManual(percent)
      }
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])
}
