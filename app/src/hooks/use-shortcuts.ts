import { useEffect, useRef } from "react"
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut"
import { isTauri } from "@/lib/tauri"
import { usePrefs } from "@/lib/prefs"
import type { FanProfile, FanStatus } from "@/lib/api"

interface Actions {
  status: FanStatus | null
  profiles: FanProfile[]
  selectProfile: (id: string) => void
  setAuto: () => void
  setManual: (percent: number) => void
}

/**
 * Raccourcis clavier globaux (actifs même fenêtre masquée) :
 * - profil suivant : parcourt les profils dans l'ordre de la liste, en boucle ;
 * - plein régime : bascule entre 100 % manuel et le retour en Auto.
 *
 * IMPORTANT : les callbacks sont enregistrés une seule fois par combinaison, mais doivent voir l'état
 * courant (profil actif, mode). On passe donc par une ref mise à jour à chaque rendu plutôt que de
 * ré-enregistrer le raccourci à chaque tick SSE (1 Hz), ce qui le rendrait indisponible par intermittence.
 */
export function useGlobalShortcuts(actions: Actions) {
  const { shortcuts } = usePrefs()
  const ref = useRef(actions)
  ref.current = actions

  useEffect(() => {
    if (!isTauri || !shortcuts.enabled) return
    // Deux actions sur la même combinaison s'écraseraient : on n'enregistre que la première.
    const bindings: [string, () => void][] = [
      [
        shortcuts.nextProfile,
        () => {
          const { status, profiles, selectProfile } = ref.current
          if (profiles.length === 0) return
          const index = profiles.findIndex((p) => p.id === status?.profile)
          selectProfile(profiles[(index + 1) % profiles.length].id)
        },
      ],
      [
        shortcuts.toggleFull,
        () => {
          const { status, setAuto, setManual } = ref.current
          if (status?.mode === "manual" && status.percent === 100) setAuto()
          else setManual(100)
        },
      ],
    ]

    let cancelled = false
    const registered: string[] = []

    ;(async () => {
      for (const [accelerator, handler] of bindings) {
        if (!accelerator || registered.includes(accelerator)) continue
        try {
          // Le plugin lève une erreur si la combinaison est déjà prise (autre appli ou rechargement de la webview).
          if (await isRegistered(accelerator)) await unregister(accelerator)
          if (cancelled) return
          // « Pressed » seulement : sans ça le callback part aussi au relâchement de la touche.
          await register(accelerator, (event) => {
            if (event.state === "Pressed") handler()
          })
          registered.push(accelerator)
        } catch {
          /* combinaison invalide ou réservée par le système : l'autre raccourci reste actif */
        }
      }
    })()

    return () => {
      cancelled = true
      registered.forEach((a) => unregister(a).catch(() => {}))
    }
  }, [shortcuts.enabled, shortcuts.nextProfile, shortcuts.toggleFull])
}
