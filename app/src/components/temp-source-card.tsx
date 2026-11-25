import { Check, Cpu, MonitorCog } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { FanStatus, TempSource } from "@/lib/api"
import { cn } from "@/lib/utils"

const OPTIONS: { id: TempSource; icon: typeof Cpu }[] = [
  { id: "cpu", icon: Cpu },
  { id: "max", icon: MonitorCog },
]

/**
 * Choix de la température qui pilote la courbe du ventilateur 1. La température de la carte n'est lue que si elle est déjà
 * allumée : l'application ne la réveille jamais pour la mesurer (voir hw.Monitor.GPUTemp côté Go).
 */
export function TempSourceCard({ status, onSelect }: { status: FanStatus | null; onSelect: (source: TempSource) => void }) {
  const { t } = useTranslation()
  const current = status?.temp_source ?? "cpu"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("control.tempSource.title")}</CardTitle>
        <CardDescription>{t("control.tempSource.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {OPTIONS.map(({ id, icon: Icon }) => {
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
                <span className="font-semibold">{t(`control.tempSource.${id}Title`)}</span>
                <p className="text-muted-foreground">{t(`control.tempSource.${id}Text`)}</p>
              </div>
              <span className="flex size-5 shrink-0 items-center justify-center">{selected && <Check className="size-4" />}</span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
