import { useEffect, useState } from "react"
import { BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { isTauri } from "@/lib/tauri"
import { updatePrefs, usePrefs } from "@/lib/prefs"

const MIN_TEMP = 30
const MAX_TEMP = 110

const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
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
  const { alerts } = usePrefs()
  const minutesLeft = useSnoozeMinutesLeft(alerts.snoozeUntil)
  const snoozed = minutesLeft > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Alertes de température</CardTitle>
        <CardDescription>
          Les alertes envoient une <b className="text-foreground">notification Windows</b> quand la température du processeur franchit un seuil, même si la fenêtre est réduite dans la zone de notification : une seule notification par franchissement, puis le seuil n'est réarmé qu'une fois la température redescendue de 5° en dessous, pour ne pas t'envoyer de message en boucle quand elle oscille autour de la limite. Ces préférences sont enregistrées dans un fichier de l'interface, indépendant du contrôleur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isTauri && <p className="text-muted-foreground">Les notifications ne fonctionnent que dans l'application installée.</p>}

        <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alerts-enabled" className="flex flex-col items-start gap-1">
              <span className="font-medium">Activer les alertes</span>
              <span className="font-normal text-muted-foreground">Notification quand un seuil est franchi.</span>
            </Label>
            <Switch id="alerts-enabled" checked={alerts.enabled} onCheckedChange={(v) => updatePrefs("alerts", { enabled: v })} />
          </div>
          <TempField
            id="alerts-warn"
            label="Seuil « Température élevée »"
            value={alerts.warnTemp}
            min={MIN_TEMP}
            max={alerts.criticalTemp - 1}
            disabled={!alerts.enabled}
            onChange={(v) => updatePrefs("alerts", { warnTemp: v })}
          />
          <TempField
            id="alerts-critical"
            label="Seuil « Température critique »"
            value={alerts.criticalTemp}
            min={alerts.warnTemp + 1}
            max={MAX_TEMP}
            disabled={!alerts.enabled}
            onChange={(v) => updatePrefs("alerts", { criticalTemp: v })}
          />
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alerts-disconnect" className="flex flex-col items-start gap-1">
              <span className="font-normal">Prévenir si le contrôleur ne répond plus</span>
              <span className="font-normal text-muted-foreground">Le ventilateur garde sa dernière vitesse tant qu'il est injoignable.</span>
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
              <span className="font-medium">Alertes de la carte graphique</span>
              <span className="font-normal text-muted-foreground">Mêmes notifications, avec des seuils à part. Une carte endormie n'en déclenche aucune.</span>
            </Label>
            <Switch id="alerts-gpu" checked={alerts.gpuEnabled} disabled={!alerts.enabled} onCheckedChange={(v) => updatePrefs("alerts", { gpuEnabled: v })} />
          </div>
          <TempField
            id="alerts-gpu-warn"
            label="Seuil « Température élevée » (carte)"
            value={alerts.gpuWarnTemp}
            min={MIN_TEMP}
            max={alerts.gpuCriticalTemp - 1}
            disabled={!alerts.enabled || !alerts.gpuEnabled}
            onChange={(v) => updatePrefs("alerts", { gpuWarnTemp: v })}
          />
          <TempField
            id="alerts-gpu-critical"
            label="Seuil « Température critique » (carte)"
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
            <span className="font-medium">Mettre en pause</span>
          </div>
          <p className="text-muted-foreground">
            Coupe temporairement les notifications « Température élevée » et celles du contrôleur, par exemple pendant une partie ou une compilation qui fait chauffer volontairement. <b className="text-foreground">L'alerte « critique » n'est jamais mise en pause.</b>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {SNOOZE_OPTIONS.map(({ label, minutes }) => (
              <Button
                key={minutes}
                size="sm"
                variant="outline"
                disabled={!alerts.enabled}
                onClick={() => updatePrefs("alerts", { snoozeUntil: Date.now() + minutes * MINUTE_MS })}
              >
                {label}
              </Button>
            ))}
            {snoozed && (
              <>
                <span className="text-muted-foreground">En pause encore {minutesLeft} min</span>
                <Button size="sm" variant="ghost" onClick={() => updatePrefs("alerts", { snoozeUntil: 0 })}>
                  Reprendre
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
