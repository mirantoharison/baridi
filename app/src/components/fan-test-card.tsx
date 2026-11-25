import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, Loader2, MinusCircle, Play, XCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type FanTestState } from "@/lib/api"

const POLL_MS = 1_000

const VERDICT_OK: Record<string, boolean> = { ok: true, weak: false, stuck: false, dead: false }

function Verdict({ name, verdict }: { name: string; verdict?: string }) {
  const { t } = useTranslation()
  if (!verdict || !(verdict in VERDICT_OK)) return null
  const Icon = VERDICT_OK[verdict] ? CheckCircle2 : XCircle
  return (
    <li className="flex items-start gap-3 p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <div className="font-medium">
          {name} : {t(`diagnostic.fanTest.verdicts.${verdict}.label`)}
        </div>
        <div className="text-muted-foreground">{t(`diagnostic.fanTest.verdicts.${verdict}.detail`)}</div>
      </div>
    </li>
  )
}

/**
 * Test actif des ventilateurs, mené par le contrôleur : trois paliers (30, 60 puis 100 %) tenus quelques secondes, avec
 * la vitesse mesurée à chacun. Complète le test rapide plus haut, qui ne regarde qu'un ventilateur.
 */
export function FanTestCard({ hasFan2 }: { hasFan2: boolean }) {
  const { t } = useTranslation()
  const [state, setState] = useState<FanTestState | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Relit l'état à l'ouverture (un test lancé avant de quitter la page continue côté contrôleur) puis, tant qu'il tourne.
  useEffect(() => {
    let isMounted = true
    const load = () =>
      api.fanTest().then((s) => isMounted && setState(s)).catch(() => {})
    load()
    if (state?.status !== "running") return () => { isMounted = false }
    const timer = setInterval(load, POLL_MS)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [state?.status])

  const start = async () => {
    setError(null)
    try {
      setState(await api.startFanTest())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const running = state?.status === "running"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("diagnostic.fanTest.title")}</CardTitle>
        <CardDescription>
          {hasFan2 ? t("diagnostic.fanTest.descriptionTwo") : t("diagnostic.fanTest.descriptionOne")}
          {hasFan2 && t("diagnostic.fanTest.biosNote")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Button disabled={running} onClick={start}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? t("diagnostic.fanTest.running") : t("diagnostic.fanTest.start")}
          </Button>
          {running && state && (
            <span className="text-muted-foreground">
              {t("diagnostic.fanTest.step", { step: state.step + 1, total: state.total })}
            </span>
          )}
          {error && <span className="text-destructive">{error}</span>}
        </div>

        {state && state.steps.length > 0 && (
          <table className="w-full border text-left">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="p-2 font-medium">{t("diagnostic.fanTest.setpoint")}</th>
                <th className="p-2 font-medium">{t("diagnostic.fanTest.fan1")}</th>
                {hasFan2 && <th className="p-2 font-medium">{t("diagnostic.fanTest.fan2")}</th>}
              </tr>
            </thead>
            <tbody>
              {state.steps.map((s) => (
                <tr key={s.percent} className="border-b last:border-0">
                  <td className="p-2 font-mono">{s.percent} %</td>
                  <td className="p-2 font-mono">{s.rpm1} RPM</td>
                  {hasFan2 && <td className="p-2 font-mono">{s.rpm2} RPM</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {state?.status === "done" && (
          <ul className="divide-y rounded-none border">
            <Verdict name={t("diagnostic.fanTest.fan1")} verdict={state.verdict1} />
            {hasFan2 && <Verdict name={t("diagnostic.fanTest.fan2")} verdict={state.verdict2} />}
          </ul>
        )}
        {(state?.status === "aborted" || state?.status === "failed") && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="size-4" /> {state.message || t("diagnostic.fanTest.interrupted")}
          </p>
        )}
        {state?.status === "idle" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <MinusCircle className="size-4" /> {t("diagnostic.fanTest.idle")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
