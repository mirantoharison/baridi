import { Check } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MiniCurve } from "@/components/mini-curve"
import { InfoNote } from "@/components/info-note"
import { TempSourceCard } from "@/components/temp-source-card"
import { TuningCard } from "@/components/tuning-card"
import type { CurveMode } from "@/lib/curve-path"
import type { CurvePoint, FanStatus, TempSource, TuningPatch } from "@/lib/api"
import { cn } from "@/lib/utils"

// Courbe d'exemple (indépendante des profils) : sert uniquement à illustrer la différence entre les deux modes.
const SAMPLE: CurvePoint[] = [
  { temp: 40, speed: 20 },
  { temp: 55, speed: 45 },
  { temp: 70, speed: 70 },
  { temp: 85, speed: 100 },
]

const OPTIONS: CurveMode[] = ["steep", "smooth"]

interface Props {
  curveMode: CurveMode
  onCurveMode: (mode: CurveMode) => void
  status: FanStatus | null
  onTuning: (patch: TuningPatch) => void
  onTempSource: (source: TempSource) => void
}

/** Préférences globales du contrôleur : passage de la puissance (Steep / Smooth) et réglages fins du mode Auto. */
export function SettingsTab({ curveMode, onCurveMode, status, onTuning, onTempSource }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote summary={<Trans i18nKey="settings.summary" components={{ b: <b />, code: <code /> }} />}>
        <Trans i18nKey="settings.details" components={{ b: <b /> }} />
      </InfoNote>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-xs">{t("settings.curveTitle")}</CardTitle>
          <CardDescription>
            <Trans i18nKey="settings.curveDescription" components={{ code: <code className="rounded bg-muted px-1 font-mono" /> }} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {OPTIONS.map((id) => {
            const selected = curveMode === id
            return (
              <button
                key={id}
                onClick={() => onCurveMode(id)}
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-5 rounded-none border p-4 text-left transition-colors hover:bg-accent/50",
                  selected && "border-primary bg-accent/40",
                )}
              >
                <div className="flex shrink-0 items-center justify-center rounded-none bg-muted px-4 py-3 text-foreground">
                  <MiniCurve points={SAMPLE} mode={id} width={120} height={56} strokeWidth={2.5} />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-sm font-semibold">{id === "steep" ? "Steep" : "Smooth"}</span>
                  <p className="text-muted-foreground">{t(`settings.${id}`)}</p>
                </div>
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {selected && <Check className="size-4 text-green-500" />}
                </span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <TempSourceCard status={status} onSelect={onTempSource} />

      <TuningCard status={status} onTuning={onTuning} />
    </div>
  )
}
