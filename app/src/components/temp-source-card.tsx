import { Check, Cpu, MonitorCog } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { FanStatus, TempSource } from "@/lib/api"
import { cn } from "@/lib/utils"

const OPTIONS: { id: TempSource; title: string; text: string; icon: typeof Cpu }[] = [
  {
    id: "cpu",
    title: "Processeur seul",
    text: "La courbe du ventilateur 1 suit uniquement la température du processeur. C'est le comportement d'origine.",
    icon: Cpu,
  },
  {
    id: "max",
    title: "La plus haute : processeur ou carte graphique",
    text: "La courbe suit la température la plus élevée des deux. Un jeu qui chauffe la carte graphique accélère le ventilateur même si le processeur reste frais.",
    icon: MonitorCog,
  },
]

/**
 * Choix de la température qui pilote la courbe du ventilateur 1. La température de la carte n'est lue que si elle est déjà
 * allumée : l'application ne la réveille jamais pour la mesurer (voir hw.Monitor.GPUTemp côté Go).
 */
export function TempSourceCard({ status, onSelect }: { status: FanStatus | null; onSelect: (source: TempSource) => void }) {
  const current = status?.temp_source ?? "cpu"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Température suivie par la courbe</CardTitle>
        <CardDescription>
          Choisis ce qui pilote le ventilateur 1 en mode Auto. La température de la carte graphique n'est lue que si la carte est déjà allumée : l'application ne la réveille jamais, et quand elle dort c'est la température du processeur qui s'applique. Le ventilateur 2 a sa propre source, réglée dans sa carte de la page Pilotage.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {OPTIONS.map(({ id, title, text, icon: Icon }) => {
          const selected = current === id
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              aria-pressed={selected}
              className={cn(
                "flex items-center gap-4 rounded-none border p-3 text-left transition-colors hover:bg-accent/50",
                selected && "border-primary bg-accent/40",
              )}
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 space-y-0.5">
                <span className="font-semibold">{title}</span>
                <p className="text-muted-foreground">{text}</p>
              </div>
              <span className="flex size-5 shrink-0 items-center justify-center">{selected && <Check className="size-4" />}</span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
