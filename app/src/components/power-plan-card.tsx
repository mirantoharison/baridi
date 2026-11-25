import { useCallback, useState } from "react"
import { Gauge } from "lucide-react"
import { Choice } from "@/components/choice"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api } from "@/lib/api"

const REFRESH_MS = 10_000

/**
 * Plan d'alimentation Windows : lu et modifiable depuis l'application. Seuls les plans réellement installés sont
 * proposés (« Performances maximales » est masqué par Windows sur la plupart des machines).
 */
export function PowerPlanCard() {
  const polled = usePolled(api.powerPlan, REFRESH_MS)
  // Réponse du dernier changement, affichée tout de suite sans attendre la relecture.
  const [overridden, setOverridden] = useState<typeof polled>(null)
  const [error, setError] = useState<string | null>(null)
  const state = overridden ?? polled

  const change = useCallback(async (plan: string) => {
    setError(null)
    try {
      setOverridden(await api.setPowerPlan(plan))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  if (!state) return null
  const isCustom = !state.available.includes(state.active)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Gauge className="size-4 text-muted-foreground" /> Plan d'alimentation Windows
        </CardTitle>
        <CardDescription>
          Le plan de Windows règle la puissance maximale du processeur et la mise en veille, en plus de ton profil de ventilateur. Le changement s'applique à toute la machine.
          {isCustom && " Un plan personnalisé est actif : choisir un plan standard le remplace."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Choice
          className="w-60"
          value={isCustom ? "" : state.active}
          options={state.available.map((p) => ({ value: p, label: p }))}
          onChange={change}
        />
        {isCustom && <span className="text-muted-foreground">Actuellement : {state.active}</span>}
        {error && <span className="text-destructive">{error}</span>}
      </CardContent>
    </Card>
  )
}
