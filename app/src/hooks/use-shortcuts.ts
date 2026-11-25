import { useEffect, useRef, useSyncExternalStore } from "react"
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut"
import { isTauri } from "@/lib/tauri"
import { manualSpeedWarning } from "@/lib/guards"
import { requestLog } from "@/lib/request-log"
import { updatePrefs, usePrefs } from "@/lib/prefs"
import type { FanProfile, FanStatus } from "@/lib/api"

/**
 * Combinaisons que Windows a refusé d'enregistrer, avec la raison (souvent : déjà prise par un autre programme). Sans
 * cela l'échec était muet : le raccourci ne faisait simplement rien. La page Raccourcis les affiche à côté du champ.
 */
let registrationErrors: Record<string, string> = {}
const errorListeners = new Set<() => void>()
function setRegistrationErrors(next: Record<string, string>) {
  registrationErrors = next
  errorListeners.forEach((l) => l())
}

/** Erreurs d'enregistrement par combinaison (vide quand tout est enregistré ou que les raccourcis sont coupés). */
export function useShortcutErrors(): Record<string, string> {
  return useSyncExternalStore(
    (cb) => {
      errorListeners.add(cb)
      return () => errorListeners.delete(cb)
    },
    () => registrationErrors,
  )
}

/** Fenêtre pendant laquelle un second appui sur le même palier compte comme « même palier » même si la rampe n'est pas finie. */
const FIXED_TOGGLE_WINDOW_MS = 15_000

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
 * - plein régime : bascule entre 100 % manuel et le retour en Auto ;
 * - vitesses fixes (10, 25, 50 et 75 %) : passent en Manuel à ce palier ; un second appui sur le même raccourci
 *   revient en Auto (comme le plein régime).
 *
 * IMPORTANT : un raccourci ne peut pas demander confirmation (la fenêtre est souvent masquée). Une vitesse fixe trop basse
 * pour la température du moment (mêmes garde-fous que la page Pilotage) est donc IGNORÉE plutôt qu'appliquée.
 *
 * IMPORTANT : les callbacks sont enregistrés une seule fois par combinaison, mais doivent voir l'état
 * courant (profil actif, mode). On passe donc par une ref mise à jour à chaque rendu plutôt que de
 * ré-enregistrer le raccourci à chaque tick SSE (1 Hz), ce qui le rendrait indisponible par intermittence.
 */
export function useGlobalShortcuts(actions: Actions) {
  const { shortcuts, widget } = usePrefs()
  const widgetRef = useRef(widget)
  widgetRef.current = widget
  const ref = useRef(actions)
  ref.current = actions
  // Dernière vitesse fixe demandée par raccourci : la rampe met quelques secondes à l'atteindre, et le statut affiche
  // encore l'ancienne vitesse pendant ce temps. Sans cette mémoire, un second appui rapide ne serait pas reconnu.
  const lastFixed = useRef<{ percent: number; at: number } | null>(null)

  useEffect(() => {
    if (!isTauri || !shortcuts.enabled) {
      setRegistrationErrors({})
      return
    }
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
    // Widget : afficher/masquer, et basculer le mode « clic traversant ».
    bindings.push([shortcuts.toggleWidget, () => updatePrefs("widget", { enabled: !widgetRef.current.enabled })])
    bindings.push([shortcuts.toggleClickThrough, () => updatePrefs("widget", { clickThrough: !widgetRef.current.clickThrough })])
    // Vitesses fixes : même mécanique, une entrée par palier.
    const fixed: [string, number][] = [
      [shortcuts.speed10, 10],
      [shortcuts.speed25, 25],
      [shortcuts.speed50, 50],
      [shortcuts.speed75, 75],
    ]
    for (const [accelerator, percent] of fixed) {
      bindings.push([
        accelerator,
        () => {
          const { status, setManual, setAuto } = ref.current
          // Second appui sur le même palier : on rend la main à l'Auto. « Même palier » = la vitesse actuelle est proche du
          // palier, ou il vient d'être demandé et la rampe n'est pas finie.
          const recent = lastFixed.current?.percent === percent && Date.now() - lastFixed.current.at < FIXED_TOGGLE_WINDOW_MS
          if (status?.mode === "manual" && (Math.abs(status.percent - percent) <= 2 || recent)) {
            lastFixed.current = null
            setAuto()
            return
          }
          if (status && manualSpeedWarning(status.temp_c, percent)) {
            // Trop bas pour la température : refusé, et dit dans le journal plutôt que silencieusement.
            requestLog.add({ method: "KEY", path: accelerator, status: "ERR", error: `${percent} % refusé : trop bas pour ${status.temp_c}°C` })
            return
          }
          lastFixed.current = { percent, at: Date.now() }
          setManual(percent)
        },
      ])
    }

    let cancelled = false
    const registered: string[] = []
    const failures: Record<string, string> = {}
    setRegistrationErrors({})

    ;(async () => {
      for (const [accelerator, handler] of bindings) {
        if (!accelerator || registered.includes(accelerator)) continue
        try {
          // Le plugin lève une erreur si la combinaison est déjà prise (autre appli ou rechargement de la webview).
          if (await isRegistered(accelerator)) await unregister(accelerator)
          if (cancelled) return
          // « Pressed » seulement : sans ça le callback part aussi au relâchement de la touche.
          await register(accelerator, (event) => {
            if (event.state !== "Pressed") return
            // Chaque appui est consigné : c'est ainsi qu'on voit si Windows livre bien la touche à l'application.
            requestLog.add({ method: "KEY", path: accelerator, status: "KEY" })
            handler()
          })
          registered.push(accelerator)
          requestLog.add({ method: "KEY", path: accelerator, status: "REG" })
        } catch (e) {
          // Combinaison invalide ou réservée : l'autre raccourci reste actif, et on le dit à l'utilisateur.
          failures[accelerator] = typeof e === "string" ? e : (e as Error).message
          requestLog.add({ method: "KEY", path: accelerator, status: "ERR", error: failures[accelerator] })
        }
      }
      if (!cancelled) setRegistrationErrors({ ...failures })
    })()

    return () => {
      cancelled = true
      registered.forEach((a) => unregister(a).catch(() => {}))
    }
  }, [shortcuts.enabled, shortcuts.nextProfile, shortcuts.toggleFull, shortcuts.toggleWidget, shortcuts.toggleClickThrough, shortcuts.speed10, shortcuts.speed25, shortcuts.speed50, shortcuts.speed75])
}
