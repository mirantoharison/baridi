import { useEffect, useState } from "react"
import { BellOff } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { isTauri } from "@/lib/tauri"
import { updatePrefs, usePrefs } from "@/lib/prefs"

const MIN_TEMP = 30
const MAX_TEMP = 110

const SNOOZE_OPTIONS: { key: string; minutes: number }[] = [
  { key: "m30", minutes: 30 },
  { key: "h1", minutes: 60 },
  { key: "h2", minutes: 120 },
]
const MINUTE_MS = 60_000
/** Le décompte affiché se rafraîchit à cette cadence : la précision à la minute suffit. */
const SNOOZE_TICK_MS = 15_000

/** Minutes restantes avant la fin de la pause (0 = pas de pause) ; se met à jour seul. */
function useSnoozeMinutesLeft(snoozeUntil: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (snoozeUntil <= Date.now()) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), SNOOZE_TICK_MS)
    return () => clearInterval(timer)
  }, [snoozeUntil])
  return Math.max(0, Math.ceil((snoozeUntil - now) / MINUTE_MS))
}

function TempField({ id, label, value, min, max, disabled, onChange }: {
  id: string
  label: string
  value: number
  min: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="font-normal">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          disabled={disabled}
          value={value}
          className="w-20 text-center font-mono"
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
          }}
        />
        <span className="text-muted-foreground">°C</span>
      </div>
    </div>
  )
}

/** Alertes thermiques (notifications natives). Préférences stockées côté interface (AppData). */
export function AlertsCard() {
  const { t } = useTranslation()
  const { alerts } = usePrefs()
  const minutesLeft = useSnoozeMinutesLeft(alerts.snoozeUntil)
  const snoozed = minutesLeft > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("config.alerts.title")}</CardTitle>
        <CardDescription>
          <Trans i18nKey="config.alerts.description" components={{ b: <b className="text-foreground" /> }} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isTauri && <p className="text-muted-foreground">{t("config.alerts.onlyInstalled")}</p>}

        <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alerts-enabled" className="flex flex-col items-start gap-1">
              <span className="font-medium">{t("config.alerts.enable")}</span>
              <span className="font-normal text-muted-foreground">{t("config.alerts.enableHint")}</span>
            </Label>
            <Switch id="alerts-enabled" checked={alerts.enabled} onCheckedChange={(v) => updatePrefs("alerts", { enabled: v })} />
          </div>
          <TempField
            id="alerts-warn"
            label={t("config.alerts.warn")}
            value={alerts.warnTemp}
            min={MIN_TEMP}
            max={alerts.criticalTemp - 1}
            disabled={!alerts.enabled}
            onChange={(v) => updatePrefs("alerts", { warnTemp: v })}
          />
          <TempField
            id="alerts-critical"
            label={t("config.alerts.critical")}
            value={alerts.criticalTemp}
            min={alerts.warnTemp + 1}
            max={MAX_TEMP}
            disabled={!alerts.enabled}
            onChange={(v) => updatePrefs("alerts", { criticalTemp: v })}
          />
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alerts-disconnect" className="flex flex-col items-start gap-1">
              <span className="font-normal">{t("config.alerts.disconnect")}</span>
              <span className="font-normal text-muted-foreground">{t("config.alerts.disconnectHint")}</span>
            </Label>
            <Switch
              id="alerts-disconnect"
              checked={alerts.notifyDisconnect}
              disabled={!alerts.enabled}
              onCheckedChange={(v) => updatePrefs("alerts", { notifyDisconnect: v })}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alerts-gpu" className="flex flex-col items-start gap-1">
              <span className="font-medium">{t("config.alerts.gpu")}</span>
              <span className="font-normal text-muted-foreground">{t("config.alerts.gpuHint")}</span>
            </Label>
            <Switch id="alerts-gpu" checked={alerts.gpuEnabled} disabled={!alerts.enabled} onCheckedChange={(v) => updatePrefs("alerts", { gpuEnabled: v })} />
          </div>
          <TempField
            id="alerts-gpu-warn"
            label={t("config.alerts.gpuWarn")}
            value={alerts.gpuWarnTemp}
            min={MIN_TEMP}
            max={alerts.gpuCriticalTemp - 1}
            disabled={!alerts.enabled || !alerts.gpuEnabled}
            onChange={(v) => updatePrefs("alerts", { gpuWarnTemp: v })}
          />
          <TempField
            id="alerts-gpu-critical"
            label={t("config.alerts.gpuCritical")}
            value={alerts.gpuCriticalTemp}
            min={alerts.gpuWarnTemp + 1}
            max={MAX_TEMP}
            disabled={!alerts.enabled || !alerts.gpuEnabled}
            onChange={(v) => updatePrefs("alerts", { gpuCriticalTemp: v })}
          />
        </div>

        <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center gap-2">
            <BellOff className="size-4 text-muted-foreground" />
            <span className="font-medium">{t("config.alerts.snooze")}</span>
          </div>
          <p className="text-muted-foreground">
            <Trans i18nKey="config.alerts.snoozeText" components={{ b: <b className="text-foreground" /> }} />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {SNOOZE_OPTIONS.map(({ key, minutes }) => (
              <Button
                key={minutes}
                size="sm"
                variant="outline"
                disabled={!alerts.enabled}
                onClick={() => updatePrefs("alerts", { snoozeUntil: Date.now() + minutes * MINUTE_MS })}
              >
                {t(`config.alerts.${key}`)}
              </Button>
            ))}
            {snoozed && (
              <>
                <span className="text-muted-foreground">{t("config.alerts.snoozeRemaining", { minutes: minutesLeft })}</span>
                <Button size="sm" variant="ghost" onClick={() => updatePrefs("alerts", { snoozeUntil: 0 })}>
                  {t("config.alerts.resume")}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
