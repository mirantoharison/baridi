import { Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MiniCurve } from "@/components/mini-curve"
import { ServiceCard } from "@/components/service-card"
import { InfoNote } from "@/components/info-note"
import type { CurveMode } from "@/lib/curve-path"
import type { CurvePoint } from "@/lib/api"
import { cn } from "@/lib/utils"

// Courbe d'exemple (indépendante des profils) : sert uniquement à illustrer la différence entre les deux modes.
const SAMPLE: CurvePoint[] = [
  { temp: 40, speed: 20 },
  { temp: 55, speed: 45 },
  { temp: 70, speed: 70 },
  { temp: 85, speed: 100 },
]

const OPTIONS: { id: CurveMode; title: string; text: string }[] = [
  { id: "steep", title: "Steep", text: "La vitesse saute d'un palier à l'autre : chaque point de la courbe fixe la vitesse tant que la température reste sous sa valeur, puis le ventilateur passe d'un coup au palier suivant dès que ce seuil est franchi (le contrôleur lisse tout de même le passage en quelques dixièmes de seconde). Le comportement est très lisible et prévisible : à une température donnée correspond toujours une vitesse bien identifiable sur la courbe, ce qui facilite les réglages fins. En contrepartie, on peut entendre un changement de régime à chaque seuil franchi, surtout quand la température oscille autour de l'un d'eux." },
  { id: "smooth", title: "Smooth", text: "La vitesse évolue progressivement : elle est interpolée linéairement entre deux points voisins de la courbe, si bien que chaque degré de plus ou de moins se traduit par un petit ajustement de la vitesse, sans jamais de marche brusque. Sous le premier point, c'est la vitesse de ce point qui est conservée, et au-dessus du dernier point celle du dernier point. Les changements de régime sont plus discrets et le ventilateur reste plus stable, ce qui est souvent plus agréable à l'oreille sur une machine dont la température fluctue beaucoup, au prix d'une courbe un peu moins directe à lire : la vitesse réelle se situe entre deux points, pas sur un palier." },
]

interface Props {
  curveMode: CurveMode
  onCurveMode: (mode: CurveMode) => void
}

/** Préférences globales du contrôleur. Pour l'instant : passage de la puissance (Steep / Smooth). */
export function SettingsTab({ curveMode, onCurveMode }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote
        summary={
          <>
        Ces <b>préférences globales</b> concernent le contrôleur dans son ensemble et non un profil en particulier. Elles sont conservées dans un fichier <code>settings.json</code> placé à côté de l'exécutable du contrôleur, ce qui signifie qu'elles sont retrouvées telles quelles à chaque lancement, que le contrôleur soit démarré par l'application ou par Windows. Tu y règles la manière dont la température est convertie en vitesse de ventilateur, ainsi que l'exécution du contrôleur comme service Windows, qui lui permet de piloter le ventilateur dès le démarrage de la machine, sans attendre que tu ouvres l'application.
          </>
        }
      >
      Le mode de <b>passage de la puissance</b> s'applique à tous les profils, mais uniquement en mode Auto : en mode Manuel, la courbe n'est de toute façon pas utilisée. En <b>Steep</b>, la courbe fonctionne par paliers : chaque point fixe la vitesse tant que la température reste inférieure à sa valeur, puis la vitesse saute au palier suivant dès que ce seuil est franchi. En <b>Smooth</b>, la vitesse est calculée par interpolation linéaire entre deux points voisins, ce qui donne une montée progressive ; sous le premier point la vitesse de ce point est conservée, et au-dessus du dernier point c'est la vitesse du dernier point qui s'applique. Dans les deux cas, le contrôleur rejoint ensuite la cible par petites étapes pour éviter les variations brutales de bruit. Les petites illustrations schématisent la différence entre les deux modes à partir d'une courbe d'exemple ; clique sur une carte pour sélectionner son mode, le changement est appliqué tout de suite et mémorisé. En dessous, la carte <b>Service Windows</b> permet d'installer le contrôleur comme un vrai service : il démarre alors avec la machine, avant même l'ouverture de ta session, et continue de piloter le ventilateur quand l'application est fermée. Son installation et sa suppression demandent les droits administrateur, et le service ne remplace pas l'application : celle-ci reste l'outil pour consulter les mesures et régler les profils.
      </InfoNote>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-xs">Passage de la puissance</CardTitle>
          <CardDescription>Choisis la manière dont la température du processeur est convertie en vitesse de ventilateur lorsque le mode Auto est actif. Le réglage est global : il vaut pour tous les profils, système comme custom, et il est enregistré dans <code className="rounded bg-muted px-1 font-mono">settings.json</code> pour les prochains lancements, que le contrôleur soit démarré par l'application ou par Windows. Il n'a aucun effet en mode Manuel, où la courbe n'est pas utilisée. Les courbes ci-dessous sont un exemple théorique destiné à illustrer la différence ; tes propres profils gardent leurs points, seule la façon de les lire change.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {OPTIONS.map(({ id, title, text }) => {
            const selected = curveMode === id
            return (
              <button
                key={id}
                onClick={() => onCurveMode(id)}
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-5 rounded-xl border p-4 text-left transition-colors hover:bg-accent/50",
                  selected && "border-primary bg-accent/40",
                )}
              >
                <div className="flex shrink-0 items-center justify-center rounded-lg bg-muted px-4 py-3 text-foreground">
                  <MiniCurve points={SAMPLE} mode={id} width={120} height={56} strokeWidth={2.5} />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-sm font-semibold">{title}</span>
                  <p className="text-muted-foreground">{text}</p>
                </div>
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {selected && <Check className="size-4 text-green-500" />}
                </span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <ServiceCard />
    </div>
  )
}
