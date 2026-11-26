import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Choice } from "@/components/choice"
import { LanguageToggle } from "@/components/language-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import type { FanStatus, Smoothing, TempSource, TuningPatch } from "@/lib/api"
import type { CurveMode } from "@/lib/curve-path"
import { updatePrefs, usePrefs } from "@/lib/prefs"
import { call, isTauri } from "@/lib/tauri"

const MAX_HYSTERESIS_C = 10
/** Même borne que fan.MaxTempFilterS côté Go. */
const MAX_TEMP_FILTER_S = 20
/** La boucle Auto relève la température toutes les 2 s : une fenêtre n'a de sens que par multiples de 2. */
const TEMP_FILTER_STEP_S = 2
const OPACITIES = [30, 55, 80]
const SMOOTHINGS: Smoothing[] = ["fast", "normal", "slow"]

/** Section : un titre puis une liste de lignes séparées, comme dans les Paramètres de Windows. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold">{title}</h2>
      <div className="divide-y border bg-card">{children}</div>
    </section>
  )
}

/** Ligne de réglage : titre et description à gauche, contrôle à droite. */
function Setting({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium">{title}</div>
        {description && <div className="leading-relaxed text-muted-foreground">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Curseur avec valeur locale pendant le glissement : on n'envoie au contrôleur qu'au relâchement. */
function SliderControl({ value, unit, max, step, onCommit }: { value: number; unit: string; max: number; step: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  return (
    <>
      <span className="w-14 shrink-0 whitespace-nowrap text-right font-mono font-semibold tabular-nums">{shown}{unit}</span>
      <Slider
        className="data-horizontal:w-48 shrink-0"
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
    </>
  )
}

/** Démarrage automatique : tâche planifiée qui lance l'interface (réduite) à l'ouverture de session. */
function AutostartSetting() {
  const { t } = useTranslation()
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri) return
    call<boolean>("autostart_status").then(setIsEnabled).catch((e) => setError(String(e)))
  }, [])

  const toggle = async (next: boolean) => {
    setIsBusy(true)
    setError(null)
    try {
      await call("autostart_set", { enabled: next })
      setIsEnabled(next)
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  const state = !isTauri ? t("config.onlyInstalled") : isBusy ? t("config.autostart.busy") : isEnabled === null ? t("config.autostart.reading") : isEnabled ? t("config.autostart.on") : t("config.autostart.off")
  return (
    <Setting title={t("config.autostart.label")} description={error ? <span className="text-destructive">{error}</span> : state}>
      <Switch checked={isEnabled ?? false} disabled={!isTauri || isEnabled === null || isBusy} onCheckedChange={toggle} />
    </Setting>
  )
}

interface Props {
  curveMode: CurveMode
  onCurveMode: (mode: CurveMode) => void
  status: FanStatus | null
  onTuning: (patch: TuningPatch) => void
  onTempSource: (source: TempSource) => void
}

/** Réglages de l'application et du contrôleur, en une page de lignes groupées par section (style Paramètres Windows). */
export function SettingsTab({ curveMode, onCurveMode, status, onTuning, onTempSource }: Props) {
  const { t } = useTranslation()
  const { widget, app } = usePrefs()
  const hysteresisC = status?.hysteresis_c ?? 0
  const filterS = status?.temp_filter_s ?? 0
  const smoothing = status?.smoothing ?? "normal"
  const tempSource = status?.temp_source ?? "cpu"

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Section title={t("settings.appearance.title")}>
        <Setting title={t("settings.appearance.theme")}>
          <ThemeToggle />
        </Setting>
        <Setting title={t("settings.appearance.language")}>
          <LanguageToggle />
        </Setting>
      </Section>

      <Section title={t("settings.window.title")}>
        <Setting title={t("settings.window.minimize")} description={t("settings.window.minimizeHint")}>
          <Switch checked={app.minimizeToTray} disabled={!isTauri} onCheckedChange={(v) => updatePrefs("app", { minimizeToTray: v })} />
        </Setting>
      </Section>

      <Section title={t("config.autostart.title")}>
        <AutostartSetting />
      </Section>

      <Section title={t("settings.tabs.fan")}>
        <Setting title={t("settings.curveTitle")} description={t(`settings.${curveMode}`)}>
          <Choice
            className="w-36"
            value={curveMode}
            options={[
              { value: "steep", label: "Steep" },
              { value: "smooth", label: "Smooth" },
            ]}
            onChange={(v) => onCurveMode(v as CurveMode)}
          />
        </Setting>
        <Setting title={t("control.tempSource.title")} description={t(`control.tempSource.${tempSource}Text`)}>
          <Choice
            className="w-72"
            value={tempSource}
            options={[
              { value: "cpu", label: t("control.tempSource.cpuTitle") },
              { value: "max", label: t("control.tempSource.maxTitle") },
            ]}
            onChange={(v) => onTempSource(v as TempSource)}
          />
        </Setting>
        <Setting title={t("settings.tuning.hysteresis")} description={hysteresisC === 0 ? t("settings.tuning.hysteresisOff") : t("settings.tuning.hysteresisOn", { value: hysteresisC })}>
          <SliderControl value={hysteresisC} unit="°" max={MAX_HYSTERESIS_C} step={1} onCommit={(v) => onTuning({ hysteresis_c: v })} />
        </Setting>
        <Setting title={t("settings.tuning.filter")} description={filterS === 0 ? t("settings.tuning.filterOff") : t("settings.tuning.filterOn", { value: filterS })}>
          <SliderControl value={filterS} unit=" s" max={MAX_TEMP_FILTER_S} step={TEMP_FILTER_STEP_S} onCommit={(v) => onTuning({ temp_filter_s: v })} />
        </Setting>
        <Setting title={t("settings.tuning.smoothing")} description={t(`settings.tuning.smoothingOptions.${smoothing}.text`)}>
          <Choice
            className="w-36"
            value={smoothing}
            options={SMOOTHINGS.map((id) => ({ value: id, label: t(`settings.tuning.smoothingOptions.${id}.title`) }))}
            onChange={(v) => onTuning({ smoothing: v as Smoothing })}
          />
        </Setting>
      </Section>

      <Section title={t("widget.title")}>
        <Setting title={t("widget.enable")} description={isTauri ? t("widget.hint") : t("config.onlyInstalled")}>
          <Switch checked={widget.enabled} disabled={!isTauri} onCheckedChange={(v) => updatePrefs("widget", { enabled: v })} />
        </Setting>
        <Setting title={t("widget.opacity")} description={t("widget.opacityHint")}>
          {OPACITIES.map((o) => (
            <Button key={o} size="sm" variant={widget.opacity === o ? "default" : "outline"} disabled={!isTauri} onClick={() => updatePrefs("widget", { opacity: o })}>
              {o} %
            </Button>
          ))}
        </Setting>
        <Setting title={t("widget.clickThrough")} description={t("widget.clickThroughHint")}>
          <Switch checked={widget.clickThrough} disabled={!isTauri} onCheckedChange={(v) => updatePrefs("widget", { clickThrough: v })} />
        </Setting>
      </Section>
    </div>
  )
}
