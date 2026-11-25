import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, MinusCircle, Play, XCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type FanTestState } from "@/lib/api"

const POLL_MS = 1_000

const VERDICTS: Record<string, { label: string; detail: string; ok: boolean }> = {
  ok: { label: "Normal", detail: "La vitesse suit la consigne à chaque palier.", ok: true },
  weak: { label: "Faible", detail: "La vitesse monte, mais moins que prévu : poussière, roulement fatigué ou hélice freinée.", ok: false },
  stuck: { label: "Ne réagit pas", detail: "La vitesse ne change pas avec la consigne : ventilateur gardé par le BIOS ou capteur figé.", ok: false },
  dead: { label: "Arrêté", detail: "Presque aucun tour à pleine consigne : ventilateur débranché, bloqué ou en panne.", ok: false },
}

function Verdict({ name, verdict }: { name: string; verdict?: string }) {
  const v = verdict ? VERDICTS[verdict] : undefined
  if (!v) return null
  const Icon = v.ok ? CheckCircle2 : XCircle
  return (
    <li className="flex items-start gap-3 p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <div className="font-medium">
          {name} : {v.label}
        </div>
        <div className="text-muted-foreground">{v.detail}</div>
      </div>
    </li>
  )
}

/**
 * Test actif des ventilateurs, mené par le contrôleur : trois paliers (30, 60 puis 100 %) tenus quelques secondes, avec
 * la vitesse mesurée à chacun. Complète le test rapide plus haut, qui ne regarde qu'un ventilateur.
 */
export function FanTestCard({ hasFan2 }: { hasFan2: boolean }) {
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
        <CardTitle className="text-xs">Test des ventilateurs</CardTitle>
        <CardDescription>
          Fait monter {hasFan2 ? "les deux ventilateurs" : "le ventilateur"} à 30 %, 60 % puis 100 % (environ 30 secondes) et vérifie que la vitesse suit. Le pilotage automatique est suspendu pendant le test, puis ton mode d'avant est restauré. Le test s'arrête tout seul si le processeur atteint 85°.
          {hasFan2 && " Si le ventilateur 2 était piloté par le BIOS, il passe ensuite en « Suivre le 1 » (non mémorisé) : revenir au BIOS libérerait aussi le ventilateur 1."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Button disabled={running} onClick={start}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Test en cours…" : "Lancer le test"}
          </Button>
          {running && state && (
            <span className="text-muted-foreground">
              Palier {state.step + 1} sur {state.total}
            </span>
          )}
          {error && <span className="text-destructive">{error}</span>}
        </div>

        {state && state.steps.length > 0 && (
          <table className="w-full border text-left">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="p-2 font-medium">Consigne</th>
                <th className="p-2 font-medium">Ventilateur 1</th>
                {hasFan2 && <th className="p-2 font-medium">Ventilateur 2</th>}
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
            <Verdict name="Ventilateur 1" verdict={state.verdict1} />
            {hasFan2 && <Verdict name="Ventilateur 2" verdict={state.verdict2} />}
          </ul>
        )}
        {(state?.status === "aborted" || state?.status === "failed") && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="size-4" /> {state.message || "Le test a été interrompu."}
          </p>
        )}
        {state?.status === "idle" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <MinusCircle className="size-4" /> Aucun test lancé depuis le démarrage du contrôleur.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
