import { useCallback, useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { call, isTauri } from "@/lib/tauri"

type ServiceState = "not-installed" | "stopped" | "running"

/** Installe ou supprime le service Windows « FanControllerCore » qui exécute le contrôleur Go. */
export function ServiceCard() {
  const { t } = useTranslation()
  const [state, setState] = useState<ServiceState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setState(await call<ServiceState>("service_status"))
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (isTauri) void refresh()
  }, [refresh])

  const toggle = async (enabled: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await call("service_set", { enabled })
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message)
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("config.service.title")}</CardTitle>
        <CardDescription>
          <Trans i18nKey="config.service.description" components={{ b: <b className="text-foreground" /> }} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-none border p-3">
          <Label htmlFor="service" className="flex flex-col items-start gap-1">
            <span className="font-medium">{t("config.service.label")}</span>
            <span className="font-normal text-muted-foreground">
              {!isTauri
                ? t("config.onlyInstalled")
                : busy
                  ? t("config.service.busy")
                  : state === null
                    ? t("config.service.reading")
                    : t(`config.service.state.${state}`)}
            </span>
          </Label>
          <Switch
            id="service"
            checked={state !== null && state !== "not-installed"}
            disabled={!isTauri || state === null || busy}
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
