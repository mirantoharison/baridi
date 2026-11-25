import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { call, isTauri } from "@/lib/tauri"

/** Active ou supprime la tâche planifiée qui lance l'interface (réduite dans la zone de notification) à l'ouverture de session. */
export function AutostartCard() {
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
        <CardTitle className="text-xs">Démarrage de l'interface avec Windows</CardTitle>
        <CardDescription>
          Le service Windows démarre le contrôleur tout seul, mais l'<b className="text-foreground">interface</b> (la fenêtre et l'icône de la zone de notification) reste une application ordinaire qu'il faut lancer. Cette option crée une <b className="text-foreground">tâche planifiée</b> nommée « BaridiFancontroller » qui ouvre l'application automatiquement dix secondes après l'ouverture de ta session, directement réduite dans la zone de notification : elle n'affiche aucune fenêtre tant que tu ne cliques pas sur son icône. La tâche s'exécute avec les privilèges les plus élevés, car l'application les exige, ce qui évite la demande de confirmation Windows à chaque démarrage, et elle est autorisée à démarrer même quand l'ordinateur fonctionne sur batterie. Elle est indépendante du service : tu peux garder l'un sans l'autre. Désactiver l'option supprime simplement la tâche ; rien d'autre n'est modifié sur ta machine. Comme pour le service, si tu déplaces l'application, désactive puis réactive l'option pour que la tâche pointe vers le nouvel emplacement. La création et la suppression de la tâche demandent les droits administrateur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-none border p-3">
          <Label htmlFor="autostart" className="flex flex-col items-start gap-1">
            <span className="font-medium">Ouvrir l'interface avec Windows</span>
            <span className="font-normal text-muted-foreground">
              {!isTauri
                ? "Disponible uniquement dans l'application installée."
                : busy
                  ? "Opération en cours…"
                  : enabled === null
                    ? "Lecture de l'état de la tâche…"
                    : enabled
                      ? "La tâche planifiée existe : l'interface s'ouvrira, réduite, à ta prochaine connexion."
                      : "Aucune tâche planifiée : l'interface ne s'ouvre pas toute seule."}
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
