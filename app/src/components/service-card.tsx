import { useCallback, useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { call, isTauri } from "@/lib/tauri"

type ServiceState = "not-installed" | "stopped" | "running"

const STATE_TEXT: Record<ServiceState, string> = {
  "not-installed":
    "Le service n'est pas installé : le contrôleur est lancé par l'application, ne pilote le ventilateur que tant qu'elle est ouverte (réduite dans la zone de notification ou non) et s'arrête quand tu la quittes réellement avec « Quitter ».",
  running:
    "Le service est installé et en cours d'exécution : le ventilateur est piloté dès le démarrage de Windows et reste piloté même si l'application est fermée.",
  stopped:
    "Le service est installé mais arrêté. Il démarrera automatiquement au prochain redémarrage de Windows.",
}

/** Installe ou supprime le service Windows « FanControllerCore » qui exécute le contrôleur Go. */
export function ServiceCard() {
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
        <CardTitle className="text-xs">Service Windows</CardTitle>
        <CardDescription>
          Installe le contrôleur comme un <b className="text-foreground">vrai service Windows</b> nommé « FanControllerCore », qui démarre avec la machine, avant même l'ouverture de ta session, et s'exécute directement avec le compte système : la fenêtre n'a plus besoin d'être ouverte pour que le ventilateur suive la courbe de ton profil actif, et il n'y a plus de demande de confirmation Windows au démarrage. Le service redémarre tout seul s'il plante (après 5 secondes la première fois, puis 15, puis 60), reprend en mode Auto avec le dernier profil et le dernier mode de courbe utilisés, suspend le pilotage quand l'ordinateur se met en veille et le relance au réveil, et remet le ventilateur sur le profil Balanced quand Windows s'éteint. Il n'écoute que sur ta propre machine (127.0.0.1) et n'accepte que les requêtes venant de l'application ; il ne peut pas être arrêté depuis celle-ci par une simple fermeture. L'application se connecte à lui au lieu de lancer son propre contrôleur : la fermer ou la réduire dans la zone de notification ne change rien au pilotage. Activer l'option arrête d'abord le contrôleur de l'application, installe le service puis le démarre ; la désactiver arrête et supprime le service, puis l'application reprend son propre contrôleur. L'installation et la suppression demandent les droits administrateur. Le service pointe vers l'emplacement actuel de l'application : si tu la déplaces ou la réinstalles ailleurs, désactive puis réactive l'option pour qu'il pointe vers le nouvel emplacement. Tu peux aussi le voir ou l'arrêter à la main dans la console « Services » de Windows, sous le nom « Baridi - Fancontroller Core ».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="service" className="flex flex-col items-start gap-1">
            <span className="font-medium">Exécuter le contrôleur comme service Windows</span>
            <span className="font-normal text-muted-foreground">
              {!isTauri
                ? "Disponible uniquement dans l'application installée."
                : busy
                  ? "Opération en cours, cela peut prendre quelques secondes…"
                  : state === null
                    ? "Lecture de l'état du service…"
                    : STATE_TEXT[state]}
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
