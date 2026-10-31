import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InfoNote } from "@/components/info-note"
import { MAX_LOG_LINES, requestLog, useRequestLog, type LogEntry } from "@/lib/request-log"
import { cn } from "@/lib/utils"

const time = (t: number) => {
  const d = new Date(t)
  return d.toLocaleTimeString("fr-FR", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0")
}

function statusClass(status: LogEntry["status"]) {
  if (status === "OPEN") return "text-green-500"
  if (status === "LOST" || status === "ERR") return "text-destructive"
  return status < 400 ? "text-green-500" : "text-destructive"
}

/** Journal des requêtes envoyées au contrôleur (les plus récentes en haut). */
export function LogsTab() {
  const entries = useRequestLog()
  const rows = [...entries].reverse()

  return (
    <div className="flex h-full flex-col gap-4">
      <InfoNote
        summary={
          <>
            Ce journal liste <b>toutes les requêtes envoyées au contrôleur</b> depuis l'ouverture de l'application : changement de mode, vitesse manuelle, choix d'un profil, création ou suppression d'un profil, chargement de la liste des profils, ainsi que l'ouverture et la perte du flux de mesures en direct. Pour chaque ligne, tu vois l'heure précise à la milliseconde, la méthode et le chemin appelés, le corps envoyé le cas échéant, le code de réponse et le temps de réponse en millisecondes. Les lignes les plus récentes sont en haut. C'est l'outil à consulter quand le ventilateur ne réagit pas comme tu l'attendais : il permet de savoir si l'application a bien envoyé l'ordre, à quel moment, et si le contrôleur l'a accepté ou refusé.
          </>
        }
      >
        Les mesures reçues chaque seconde ne sont volontairement pas consignées, sinon elles noieraient les actions utiles en quelques minutes. De même, une perte de connexion n'est consignée qu'une seule fois, et non à chaque tentative de reconnexion. Le journal est stocké dans le <b>localStorage</b> de la fenêtre et plafonné à <b>{MAX_LOG_LINES} lignes</b> : au-delà, les plus anciennes sont supprimées une à une pour faire de la place aux nouvelles. Il est <b>entièrement effacé à la fermeture réelle</b> de l'application, c'est-à-dire avec « Quitter » dans le menu de la zone de notification, et jamais simplement quand tu réduis la fenêtre ou que tu cliques sur la croix. Si l'application s'est arrêtée brutalement, par exemple lors d'un plantage ou d'une extinction forcée, le journal de la session précédente est jeté au lancement suivant plutôt que mélangé à la nouvelle session. Un code en vert indique une réponse acceptée par le contrôleur, un code en rouge une erreur renvoyée par celui-ci, et « ERR » signifie que la requête n'a même pas pu l'atteindre, parce que le contrôleur est arrêté ou pas encore démarré. Les lignes « SSE » signalent l'ouverture (OPEN) ou la perte (LOST) du flux de mesures. Le bouton « Vider » efface le journal immédiatement.
      </InfoNote>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs">
            Requêtes envoyées ({entries.length}/{MAX_LOG_LINES})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => requestLog.clear()} disabled={entries.length === 0}>
            <Trash2 /> Vider
          </Button>
        </CardHeader>
        <CardContent className="relative min-h-0 flex-1">
          {rows.length === 0 ? (
            <p className="m-auto py-8 text-center text-muted-foreground">Aucune requête pour l'instant.</p>
          ) : (
            <div className="absolute inset-x-4 inset-y-0">
              <ScrollArea className="h-full">
                <ul className="pr-3 font-mono">
                  {rows.map((e) => (
                    <li key={e.id} className="flex gap-3 border-b border-border/50 py-1.5 last:border-0">
                      <span className="shrink-0 text-muted-foreground">{time(e.t)}</span>
                      <span className="w-12 shrink-0 font-semibold">{e.method}</span>
                      <span className="min-w-0 flex-1 break-all">
                        {e.path}
                        {e.body && <span className="text-muted-foreground"> {e.body}</span>}
                        {e.error && <span className="text-destructive"> — {e.error}</span>}
                      </span>
                      <span className={cn("w-10 shrink-0 text-right", statusClass(e.status))}>{e.status}</span>
                      <span className="w-14 shrink-0 text-right text-muted-foreground">{e.ms !== undefined ? `${e.ms} ms` : ""}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
