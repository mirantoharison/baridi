import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { call, isTauri } from "@/lib/tauri"

/** Active ou supprime la tâche planifiée qui lance l'interface (réduite dans la zone de notification) à l'ouverture de session. */
export function AutostartCard() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri) return
    call<boolean>("autostart_status")
      .then(setEnabled)
      .catch((e) => setError(String(e)))
  }, [])

  const toggle = async (next: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await call("autostart_set", { enabled: next })
      setEnabled(next)
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("config.autostart.title")}</CardTitle>
        <CardDescription>
          <Trans i18nKey="config.autostart.description" components={{ b: <b className="text-foreground" /> }} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-none border p-3">
          <Label htmlFor="autostart" className="flex flex-col items-start gap-1">
            <span className="font-medium">{t("config.autostart.label")}</span>
            <span className="font-normal text-muted-foreground">
              {!isTauri
                ? t("config.onlyInstalled")
                : busy
                  ? t("config.autostart.busy")
                  : enabled === null
                    ? t("config.autostart.reading")
                    : enabled
                      ? t("config.autostart.on")
                      : t("config.autostart.off")}
            </span>
          </Label>
          <Switch
            id="autostart"
            checked={enabled ?? false}
            disabled={!isTauri || enabled === null || busy}
            onCheckedChange={(v) => toggle(v)}
          />
        </div>
        {error && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
