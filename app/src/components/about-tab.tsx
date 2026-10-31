import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import baridiIcon from "@/assets/baridi-icon.png"
import { isTauri } from "@/lib/tauri"

const CONTACT = "mirantohrs@gmail.com"
// Repli hors Tauri (navigateur de dev) : doit rester aligné sur package.json et tauri.conf.json.
const FALLBACK_VERSION = "2.0.0"

const STACK: { label: string; detail: string }[] = [
  { label: "Interface", detail: "React 19, Vite, Tailwind CSS 4 et composants shadcn/ui" },
  { label: "Application de bureau", detail: "Tauri 2 (Rust) : fenêtre, zone de notification, instance unique" },
  { label: "Contrôleur", detail: "Go : courbes, API locale sur 127.0.0.1:8787, service Windows « FanControllerCore »" },
  { label: "Matériel", detail: "AsusWinIO64.dll, la bibliothèque ASUS qui lit la température et pilote le ventilateur" },
]

/** Page « À propos » : présentation, version, technologies et copyright. */
export function AboutTab() {
  const [version, setVersion] = useState(FALLBACK_VERSION)

  useEffect(() => {
    if (!isTauri) return
    getVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  return (
    <div className="h-full">
      <ScrollArea className="h-full">
        <div className="flex min-h-full flex-col gap-4 pr-3">
          <Card>
            <CardContent className="flex items-center gap-5">
              <img src={baridiIcon} alt="" className="size-20 shrink-0 rounded-2xl" />
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight">Baridi - Fancontroller</h2>
                <p className="text-muted-foreground">Le gardien silencieux de la température de ton PC portable.</p>
                <Badge variant="secondary">Version {version}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs">Ce que fait l'application</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-muted-foreground">
              <p>
                <b className="text-foreground">Baridi - Fancontroller</b> te permet de piloter les ventilateurs de ton ordinateur portable ASUS directement depuis Windows, sans passer par le logiciel constructeur. Elle lit en continu la température du processeur et ajuste la vitesse du ventilateur selon une <b className="text-foreground">courbe</b> que tu définis : plus la machine chauffe, plus il tourne vite, et inversement quand elle se calme, pour garder un bon équilibre entre refroidissement et silence. Le but est de te donner la main sur un réglage que le constructeur impose habituellement : tu décides à partir de quelle température le ventilateur s'emballe, à quelle vitesse il tourne en usage léger, et si tu préfères une machine plus fraîche ou plus discrète selon ce que tu fais.
              </p>
              <p>
                Tu peux choisir entre plusieurs <b className="text-foreground">profils</b> prêts à l'emploi (Silent, Balanced, Turbo) ou créer les tiens, avec leur nom, leur description, leur icône et leur propre courbe, que tu peux dupliquer, modifier ou supprimer à tout moment. Deux manières de suivre la courbe sont disponibles : par paliers (<b className="text-foreground">Steep</b>), où la vitesse saute d'un seuil à l'autre, ou de façon progressive (<b className="text-foreground">Smooth</b>), où elle évolue en douceur entre les points. Si tu préfères garder la main, le mode Manuel fixe la vitesse que tu choisis, et l'onglet Info affiche en direct la température, les tours par minute et l'historique des 90 dernières secondes. Pour éviter tout à-coup, le contrôleur n'applique jamais un changement d'un seul bond : il rejoint la vitesse demandée par petites étapes successives.
              </p>
              <p>
                Le pilotage est assuré par un petit programme séparé, le <b className="text-foreground">contrôleur</b>, qui dialogue directement avec le matériel grâce à la bibliothèque ASUS et peut s'installer comme un vrai service Windows : il démarre alors avec la machine, avant même que tu ouvres ta session, et continue de veiller sur la température même quand l'application est fermée. Celle-ci se réduit dans la zone de notification au lieu de quitter quand tu cliques sur la croix ou que tu utilises Alt+F4 ; pour la fermer vraiment, utilise « Quitter » dans le menu de l'icône. Un journal des requêtes envoyées au contrôleur, effacé à chaque fermeture réelle, est consultable dans l'onglet Logs pour comprendre ce qui s'est passé. En cas de mise en veille, le pilotage est suspendu puis repris au réveil, et à l'arrêt de la machine le ventilateur est ramené sur le profil Balanced. Tout fonctionne en local : le contrôleur n'écoute que sur ton ordinateur, n'accepte que les requêtes de l'application, et aucune donnée ne quitte ta machine.
              </p>
              <p>
                Attention : piloter un ventilateur modifie la façon dont ton ordinateur gère sa chaleur. Une courbe trop timide ou une vitesse manuelle trop basse peuvent faire monter la température du processeur au-delà de ce que le constructeur prévoit. Surveille l'onglet Info quand tu testes de nouveaux réglages, et reviens sur un profil système comme Balanced au moindre doute.
              </p>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-xs">Technologies</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-lg border">
                {STACK.map(({ label, detail }) => (
                  <li key={label} className="flex gap-4 p-3">
                    <span className="w-40 shrink-0 font-medium">{label}</span>
                    <span className="text-muted-foreground">{detail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <p className="pb-1 text-center text-muted-foreground">
            © {new Date().getFullYear()}{" "}
            <a href={`mailto:${CONTACT}`} className="text-foreground underline-offset-4 hover:underline">
              {CONTACT}
            </a>
            . Tous droits réservés.
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}
