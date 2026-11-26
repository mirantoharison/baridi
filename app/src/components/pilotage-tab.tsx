import { ControlCard } from "@/components/control-card"
import { Fan2Card } from "@/components/fan2-card"
import { PowerPlanCard } from "@/components/power-plan-card"
import type { Fan2Curve, Fan2Mode, FanProfile, FanStatus } from "@/lib/api"

interface Props {
  status: FanStatus | null
  profiles: FanProfile[]
  onAuto: () => void
  onManual: (percent: number) => void
  onStop: () => void
  onSelectProfile: (id: string) => void
  onFan2Curve: (curve: Fan2Curve) => void
  onFan2: (mode: Fan2Mode, percent?: number) => void
}

/**
 * Ce qu'on fait en direct : commande des ventilateurs l'un sous l'autre (avec leurs mesures en direct), plan d'alimentation,
 * et plan d'alimentation. Le profil actif se choisit dans la carte du ventilateur 1 (mode Auto). IMPORTANT : on ne modifie
 * pas un profil ici ; la création et la modification des profils se font dans la page Profils.
 */
export function PilotageTab({ status, profiles, onAuto, onManual, onStop, onSelectProfile, onFan2, onFan2Curve }: Props) {
  const hasFan2 = status?.fan2_rpm !== undefined

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-4">
        <ControlCard mode={status?.mode ?? "idle"} percent={status?.percent ?? 0} temp={status?.temp_c} rpm={status?.rpm} onAuto={onAuto} onManual={onManual} onStop={onStop} profiles={profiles} activeProfileId={status?.profile} onSelectProfile={onSelectProfile} />
        {/* Seulement si le contrôleur annonce deux ventilateurs (fan2_rpm absent sinon). */}
        {status && hasFan2 && <Fan2Card status={status} onFan2={onFan2} onFan2Curve={onFan2Curve} />}
      </div>

      <PowerPlanCard />
    </div>
  )
}
