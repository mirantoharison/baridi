import { useEffect, useRef, useState } from "react"
import { Gauge, Hand, Power, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { FanMode } from "@/lib/api"
import { cn } from "@/lib/utils"

const MODES: { id: FanMode; label: string; icon: typeof Sparkles }[] = [
  { id: "auto", label: "Auto", icon: Sparkles },
  { id: "manual", label: "Manuel", icon: Hand },
  { id: "idle", label: "Arrêt", icon: Power },
]

const PRESETS = [25, 50, 75, 100]

interface Props {
  mode: FanMode
  percent: number
  onAuto: () => void
  onManual: (percent: number) => void
  onStop: () => void
}

/** Choix du mode ; le curseur manuel n'apparaît qu'en mode Manuel (envoi différé pour ne pas inonder le contrôleur). */
export function ControlCard({ mode, percent, onAuto, onManual, onStop }: Props) {
  const [value, setValue] = useState(percent)
  const dragging = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Suit la valeur réelle sauf pendant que l'utilisateur tire le curseur.
  useEffect(() => {
    if (!dragging.current) setValue(percent)
  }, [percent])

  const commit = (v: number) => {
    setValue(v)
    dragging.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      onManual(v)
      dragging.current = false
    }, 150)
  }

  const select = (id: FanMode) => {
    if (id === "auto") onAuto()
    else if (id === "idle") onStop()
    else onManual(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Gauge className="size-4 text-muted-foreground" /> Pilotage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => select(id)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors",
                mode === id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Vitesse manuelle</span>
              <span className="font-mono text-base font-semibold tabular-nums">{value}%</span>
            </div>
            <Slider value={[value]} min={0} max={100} step={5} onValueChange={(v) => commit(Array.isArray(v) ? v[0] : v)} />
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <Button key={p} size="sm" variant="outline" onClick={() => commit(p)}>
                  {p}%
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {mode === "auto"
              ? "Le mode Auto est actif : toutes les 2 secondes, le contrôleur relève la température du processeur, détermine la vitesse prévue par la courbe du profil actif, puis y amène progressivement le ventilateur, par petites étapes pour éviter les changements de régime brutaux. Tu n'as rien à régler ici : change simplement de profil actif ci-dessous si tu veux un comportement plus silencieux ou plus rafraîchissant. Choisis Manuel si tu veux fixer toi-même la vitesse, par exemple pour un test de bruit ou pour forcer un refroidissement maximal avant une tâche lourde ; le curseur apparaîtra alors à cet endroit."
              : "Le pilotage automatique est coupé : le contrôleur ne lit plus la température pour ajuster la vitesse, et le ventilateur reste sur la dernière vitesse appliquée jusqu'à ton prochain choix, sans que le comportement d'origine de la machine reprenne la main. Garde un œil sur la température dans l'onglet Info, car rien ne la fera redescendre tant que tu n'as pas relancé le mode Auto ou fixé une vitesse en mode Manuel. Si tu comptes laisser l'ordinateur sans surveillance, repasse en Auto : c'est le mode le plus sûr, puisque la vitesse s'adapte alors à la température à chaque instant."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
