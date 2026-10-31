import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ControlCard } from "@/components/control-card"
import { CurveEditor } from "@/components/curve-editor"
import { InfoNote } from "@/components/info-note"
import { ProfileIcon } from "@/lib/profile-icons"
import type { FanProfile, FanStatus } from "@/lib/api"

interface Props {
  status: FanStatus | null
  profiles: FanProfile[]
  onAuto: () => void
  onManual: (percent: number) => void
  onStop: () => void
  onSelectProfile: (id: string) => void
}

/** Ce qu'on fait en direct : mode, vitesse manuelle, profil actif et sa courbe avec la température courante. */
export function PilotageTab({ status, profiles, onAuto, onManual, onStop, onSelectProfile }: Props) {
  const active = profiles.find((p) => p.id === status?.profile)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote
        summary={
          <>
        Cet onglet sert à <b>piloter le ventilateur en direct</b>. Tu y choisis le <b>mode de fonctionnement</b> (Auto, Manuel ou Arrêt), tu fixes la vitesse à la main quand tu veux reprendre la main, et tu sélectionnes le <b>profil actif</b> dont la courbe décide de la vitesse en mode Auto. La courbe affichée en bas montre exactement ce que le contrôleur applique, avec un repère vertical qui suit la température du processeur en temps réel : tu vois donc à tout moment où tu te situes sur la courbe et quelle vitesse en découle. Toutes les actions de cet onglet sont envoyées immédiatement au contrôleur et consignées dans l'onglet Logs, ce qui permet de vérifier a posteriori ce qui a été demandé et à quelle heure.
          </>
        }
      >
      En mode <b>Auto</b>, le contrôleur lit la température toutes les 2 secondes, calcule la vitesse cible à partir de la courbe du profil actif, puis rejoint cette cible par petites étapes successives plutôt que d'un seul coup (par défaut, 5 unités de PWM toutes les 50 millisecondes), ce qui évite les à-coups de bruit ; la transition ne repart que si la cible a réellement changé. Le contrôleur démarre toujours en Auto, avec le dernier profil utilisé, y compris lorsqu'il est lancé comme service avant même que tu ouvres l'application. En mode <b>Manuel</b>, le pilotage automatique est coupé et la vitesse que tu choisis (par pas de 5 %, avec des préréglages à 25, 50, 75 et 100 %) est appliquée telle quelle, quelle que soit la température : pense à surveiller celle-ci dans l'onglet Info. La valeur n'est envoyée qu'une fraction de seconde après que tu as lâché le curseur, pour ne pas inonder le contrôleur de requêtes pendant que tu le fais glisser. En mode <b>Arrêt</b>, le pilotage automatique est simplement suspendu et la vitesse en cours est conservée, sans retour au comportement d'origine de la machine : rien ne fera redescendre la température tant que tu n'as pas relancé le mode Auto. Changer de profil actif prend effet au prochain relevé en mode Auto, soit au plus tard 2 secondes plus tard, et ce choix est mémorisé pour le prochain lancement. Quand l'ordinateur se met en veille, le contrôleur suspend le pilotage automatique, puis le relance à la sortie de veille. À la fermeture de l'application, ou à l'arrêt de Windows, il ramène le ventilateur sur le profil Balanced avant de s'arrêter, pour ne jamais laisser la machine sur une vitesse figée. Si le contrôleur tourne comme service Windows, fermer l'application ne l'arrête pas : le pilotage continue.
      </InfoNote>

      <ControlCard mode={status?.mode ?? "idle"} percent={status?.percent ?? 0} onAuto={onAuto} onManual={onManual} onStop={onStop} />

      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-xs">Profil actif</CardTitle>
          <Select value={status?.profile ?? ""} onValueChange={(v) => v && onSelectProfile(v)}>
            <SelectTrigger className="w-56">
              {active ? (
                <span className="flex items-center gap-2">
                  <ProfileIcon name={active.icon} /> {active.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Choisir un profil</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <ProfileIcon name={p.icon} /> {p.name}
                    {p.source === "user" && <Badge variant="secondary">Custom</Badge>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2">
          {active ? (
            <>
              {active.description && <p className="text-muted-foreground">{active.description}</p>}
              <CurveEditor points={active.points} temp={status?.temp_c} className="min-h-60 flex-1" mode={status?.curve_mode} />
            </>
          ) : (
            <p className="text-muted-foreground">Aucun profil sélectionné.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
