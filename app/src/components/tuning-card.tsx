import { useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import type { FanStatus, Smoothing, TuningPatch } from "@/lib/api"
import { cn } from "@/lib/utils"

const MAX_HYSTERESIS_C = 10
/** Même borne que fan.MaxTempFilterS côté Go : au-delà, une vraie montée en température tarderait trop à être vue. */
const MAX_TEMP_FILTER_S = 20
/** La boucle Auto relève la température toutes les 2 s : une fenêtre n'a de sens que par multiples de 2. */
const TEMP_FILTER_STEP_S = 2

const SMOOTHING_IDS: Smoothing[] = ["fast", "normal", "slow"]

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
  const { t } = useTranslation()
  const hysteresisC = status?.hysteresis_c ?? 0
  const filterS = status?.temp_filter_s ?? 0
  const smoothing = status?.smoothing ?? "normal"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("settings.tuning.title")}</CardTitle>
        <CardDescription>
          <Trans i18nKey="settings.tuning.description" components={{ b: <b className="text-foreground" /> }} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SliderRow
          title={t("settings.tuning.hysteresis")}
          description={hysteresisC === 0 ? t("settings.tuning.hysteresisOff") : t("settings.tuning.hysteresisOn", { value: hysteresisC })}
          value={hysteresisC}
          unit="°"
          max={MAX_HYSTERESIS_C}
          step={1}
          onCommit={(v) => onTuning({ hysteresis_c: v })}
        />

        <SliderRow
          title={t("settings.tuning.filter")}
          description={filterS === 0 ? t("settings.tuning.filterOff") : t("settings.tuning.filterOn", { value: filterS })}
          value={filterS}
          unit=" s"
          max={MAX_TEMP_FILTER_S}
          step={TEMP_FILTER_STEP_S}
          onCommit={(v) => onTuning({ temp_filter_s: v })}
        />

        <div className="space-y-2">
          <span className="font-medium">{t("settings.tuning.smoothing")}</span>
          <div className="grid grid-cols-3 gap-2">
            {SMOOTHING_IDS.map((id) => (
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
                {t(`settings.tuning.smoothingOptions.${id}.title`)}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground">{t(`settings.tuning.smoothingOptions.${smoothing}.text`)}</p>
        </div>
      </CardContent>
    </Card>
  )
}
