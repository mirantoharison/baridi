import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { AboutInfoCard } from "@/components/about-info-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TechTiles } from "@/components/tech-tiles"
import { ScrollArea } from "@/components/ui/scroll-area"
import baridiIcon from "@/assets/baridi-icon.png"
import { isTauri } from "@/lib/tauri"

const CONTACT = "mirantohrs@gmail.com"
// Repli hors Tauri (navigateur de dev) : doit rester aligné sur package.json et tauri.conf.json.
const FALLBACK_VERSION = "2.0.0"

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
              <img src={baridiIcon} alt="" className="size-20 shrink-0 rounded-none" />
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
            <CardContent className="text-muted-foreground">
              <p>
                Baridi - Fancontroller pilote les ventilateurs de ton portable ASUS depuis Windows, sans le logiciel constructeur : il lit la température du processeur et règle la vitesse selon une courbe que tu choisis, via des profils prêts à l'emploi (Silent, Balanced, Turbo), les tiens, ou un mode Manuel. La page Info montre en direct la température, les ventilateurs, le processeur, la carte graphique, la mémoire et la batterie, et les alertes, raccourcis et diagnostic ont leurs propres pages. Un petit programme, le contrôleur, parle au matériel et peut tourner comme service Windows, application fermée ; tout reste en local, protégé par une clé d'API, et aucune donnée ne quitte ta machine. Attention : une courbe trop timide peut faire trop chauffer ton PC, alors surveille la page Info quand tu testes un réglage et reviens sur Balanced au moindre doute.
              </p>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-xs">Technologies</CardTitle>
            </CardHeader>
            <CardContent>
              <TechTiles />
            </CardContent>
          </Card>

          <AboutInfoCard />

          <p className="pb-1 text-center text-muted-foreground">
            Fait avec ❤️ et esprit 🦄, pour tous les 🌈 · © {new Date().getFullYear()} Baridi · Miranto Harison RANDRIAMAMPIANINA ·{" "}
            <a href={`mailto:${CONTACT}`} className="text-foreground underline-offset-4 hover:underline">
              {CONTACT}
            </a>
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}
