import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ControlCard } from "@/components/control-card"
import { CurveEditor } from "@/components/curve-editor"
import { PowerPlanCard } from "@/components/power-plan-card"
import { Fan2Card } from "@/components/fan2-card"
import { InfoNote } from "@/components/info-note"
import { ProfileIcon } from "@/lib/profile-icons"
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

/** Ce qu'on fait en direct : mode, vitesse manuelle, profil actif et sa courbe avec la température courante. */
export function PilotageTab({ status, profiles, onAuto, onManual, onStop, onSelectProfile, onFan2, onFan2Curve }: Props) {
  const { t } = useTranslation()
  const active = profiles.find((p) => p.id === status?.profile)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote summary={<Trans i18nKey="control.tab.summary" components={{ b: <b /> }} />}>
        <Trans i18nKey="control.tab.details" components={{ b: <b /> }} />
      </InfoNote>

      <ControlCard mode={status?.mode ?? "idle"} percent={status?.percent ?? 0} temp={status?.temp_c} onAuto={onAuto} onManual={onManual} onStop={onStop} />

      {/* Seulement si le contrôleur annonce deux ventilateurs (fan2_rpm absent sinon). */}
      {status && status.fan2_rpm !== undefined && <Fan2Card status={status} onFan2={onFan2} onFan2Curve={onFan2Curve} />}

      <PowerPlanCard />

      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-xs">{t("control.tab.activeProfile")}</CardTitle>
          <Select value={status?.profile ?? ""} onValueChange={(v) => v && onSelectProfile(v)}>
            <SelectTrigger className="w-56">
              {active ? (
                <span className="flex items-center gap-2">
                  <ProfileIcon name={active.icon} /> {active.name}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("control.tab.chooseProfile")}</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <ProfileIcon name={p.icon} /> {p.name}
                    {p.source === "user" && <Badge variant="secondary">{t("control.tab.custom")}</Badge>}
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
            <p className="text-muted-foreground">{t("control.tab.noProfile")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
