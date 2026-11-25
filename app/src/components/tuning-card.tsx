import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import type { FanStatus, Smoothing, TuningPatch } from "@/lib/api"
import { cn } from "@/lib/utils"

const MAX_HYSTERESIS_C = 10
/** Même borne que fan.MaxTempFilterS côté Go : au-delà, une vraie montée en température tarderait trop à être vue. */
const MAX_TEMP_FILTER_S = 20
/** La boucle Auto relève la température toutes les 2 s : une fenêtre n'a de sens que par multiples de 2. */
const TEMP_FILTER_STEP_S = 2

const SMOOTHING_OPTIONS: { id: Smoothing; title: string; text: string }[] = [
  { id: "fast", title: "Réactif", text: "Le ventilateur change de vitesse deux fois plus vite. Il suit la température de près, au prix de variations de bruit plus audibles." },
  { id: "normal", title: "Normal", text: "Le rythme défini par le profil actif, sans modification." },
  { id: "slow", title: "Doux", text: "Les changements de vitesse sont trois fois plus lents : montées et descentes très progressives, presque inaudibles." },
]

interface Props {
  status: FanStatus | null
  onTuning: (patch: TuningPatch) => void
}

/** Curseur avec valeur locale pendant le glissement : on n'envoie au contrôleur qu'au relâchement. */
function SliderRow({ title, description, value, unit, max, step, onCommit }: {
  title: string
  description: string
  value: number
  unit: string
  max: number
  step: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value

  return (
    <div className="space-y-3 rounded-none border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">{description}</span>
        </div>
        <span className="font-mono text-base font-semibold tabular-nums">{shown}{unit}</span>
      </div>
      <Slider
        value={[shown]}
        min={0}
        max={max}
        step={step}
        onValueChange={(v) => setDraft(Array.isArray(v) ? v[0] : v)}
        onValueCommitted={(v) => {
          const next = Array.isArray(v) ? v[0] : v
          setDraft(null)
          if (next !== value) onCommit(next)
        }}
      />
    </div>
  )
}

/** Réglages fins du mode Auto (hystérésis, filtre anti-pic, lissage) et recopie sur le second ventilateur. Valables pour tous les profils. */
export function TuningCard({ status, onTuning }: Props) {
  const hysteresisC = status?.hysteresis_c ?? 0
  const filterS = status?.temp_filter_s ?? 0
  const smoothing = status?.smoothing ?? "normal"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Réglages fins du mode Auto</CardTitle>
        <CardDescription>
          Ces réglages s'appliquent à <b className="text-foreground">tous les profils</b> et uniquement en mode Auto. L'<b className="text-foreground">hystérésis</b> évite que le ventilateur « pompe » quand la température oscille autour d'un seuil : une baisse de vitesse n'est appliquée qu'une fois la température redescendue du nombre de degrés choisi sous celle du dernier changement. Le <b className="text-foreground">filtre anti-pic</b> fait réagir le contrôleur à la moyenne des dernières secondes plutôt qu'à chaque mesure, pour ignorer un pic bref. Les <b className="text-foreground">montées de vitesse restent immédiates</b> et le filtre est ignoré dès 90° : refroidir passe avant le silence. Un changement de profil ou de mode de courbe s'applique tout de suite. Le <b className="text-foreground">lissage</b> règle la vitesse à laquelle le ventilateur rejoint sa nouvelle consigne.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SliderRow
          title="Hystérésis"
          description={hysteresisC === 0 ? "Désactivée : le ventilateur ralentit dès que la courbe le demande." : `Ralentit après une baisse de ${hysteresisC}° sous le dernier changement.`}
          value={hysteresisC}
          unit="°"
          max={MAX_HYSTERESIS_C}
          step={1}
          onCommit={(v) => onTuning({ hysteresis_c: v })}
        />

        <SliderRow
          title="Filtre anti-pic"
          description={filterS === 0 ? "Désactivé : chaque mesure de température compte." : `Moyenne glissante sur les ${filterS} dernières secondes.`}
          value={filterS}
          unit=" s"
          max={MAX_TEMP_FILTER_S}
          step={TEMP_FILTER_STEP_S}
          onCommit={(v) => onTuning({ temp_filter_s: v })}
        />

        <div className="space-y-2">
          <span className="font-medium">Lissage des transitions</span>
          <div className="grid grid-cols-3 gap-2">
            {SMOOTHING_OPTIONS.map(({ id, title }) => (
              <button
                key={id}
                type="button"
                onClick={() => onTuning({ smoothing: id })}
                aria-pressed={smoothing === id}
                className={cn(
                  "rounded-none border px-3 py-2 text-center font-medium transition-colors hover:bg-accent/50",
                  smoothing === id && "border-primary bg-accent/40",
                )}
              >
                {title}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground">{SMOOTHING_OPTIONS.find((o) => o.id === smoothing)?.text}</p>
        </div>
      </CardContent>
    </Card>
  )
}
