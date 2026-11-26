import { Thermometer, Wind } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoNote } from "@/components/info-note"
import { FanRotor } from "@/components/fan-rotor"
import { CpuCard, GpuCard, MemoryBatteryCard, SensorsCard } from "@/components/hardware-cards"
import { MachineCard, SessionCard } from "@/components/session-cards"
import { HistoryChart } from "@/components/history-chart"
import { TempGauge } from "@/components/temp-gauge"
import { fan2CurveTarget } from "@/lib/fan2"
import type { Fan } from "@/lib/nav"
import { cn } from "@/lib/utils"

/** Animation de la roue du second ventilateur quand sa puissance est inconnue : assez lente pour ne pas suggérer une vitesse précise. */
const UNKNOWN_POWER_ROTOR_PERCENT = 30

/** Carte d'un ventilateur : roue animée, vitesse mesurée et, si connue, puissance demandée. */
function FanCard({ title, rpm, rotorPercent, power, powerLabel }: {
  title: string
  rpm: number
  rotorPercent: number
  /** null = puissance inconnue (non affichée). */
  power: string | null
  /**
   * « Puissance » = ce que le ventilateur reçoit réellement (ventilateur 1, dont le contrôleur écrit la consigne).
   * « Consigne demandée » pour le ventilateur 2 : on l'envoie mais le matériel ne la suit pas forcément — seul le RPM mesuré fait foi.
   */
  powerLabel?: string
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Wind className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-4">
        <FanRotor percent={rotorPercent} className="size-20 text-foreground" />
        <div className="text-center">
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {rpm}
            <span className="ml-1 text-xs text-muted-foreground">RPM</span>
          </div>
          <div className="mt-1 text-muted-foreground">
            {power === null ? t("info.fan.bios") : <>{powerLabel ?? t("info.fan.power")} <span className="font-mono text-foreground">{power}</span></>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** État en direct du contrôleur : jauge de température, ventilateur(s) et historique récent. Lecture seule. */
export function InfoTab({ fan }: { fan: Fan }) {
  const { t } = useTranslation()
  const s = fan.status
  const fan2Rpm = s?.fan2_rpm
  const hasFan2 = fan2Rpm !== undefined
  // Mode « courbe » du ventilateur 2 : consigne calculée avec la même formule que le contrôleur (voir lib/fan2.ts).
  const fan2CurvePercent = fan2CurveTarget(s)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote summary={<Trans i18nKey="info.summary" components={{ b: <b /> }} />}>
        <Trans i18nKey="info.details" components={{ b: <b /> }} />
      </InfoNote>

      {/* 2 cartes sur une machine à un ventilateur, 3 dès que le second a été détecté (le contrôleur n'envoie fan2_rpm qu'après l'avoir vu tourner). */}
      <div className={cn("grid gap-4", hasFan2 ? "grid-cols-3" : "grid-cols-2")}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs">
              <Thermometer className="size-4 text-muted-foreground" /> {t("info.cpuTemp")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 items-center justify-center">
            <TempGauge temp={s?.temp_c ?? 0} />
          </CardContent>
        </Card>

        <FanCard
          title={hasFan2 ? t("info.fan.title1") : t("info.fan.title")}
          rpm={s?.rpm ?? 0}
          rotorPercent={s?.percent ?? 0}
          // En mode BIOS la consigne du contrôleur est ignorée par le matériel : l'afficher serait trompeur.
          power={s?.bios_override ? null : `${s?.percent ?? 0}%`}
        />

        {fan2Rpm !== undefined && (
          <FanCard
            title={t("info.fan.title2")}
            rpm={fan2Rpm}
            // En mode « firmware » la consigne vient de la carte mère : aucune puissance à afficher, et la roue tourne à
            // vitesse fixe tant qu'il tourne. En « suivre » il reçoit la consigne du ventilateur 1, en « manuel » la sienne.
            rotorPercent={
              s?.fan2_mode === "manual" ? (s.fan2_percent ?? 0) : s?.fan2_mode === "follow" ? s.percent : fan2CurvePercent ?? (fan2Rpm > 0 ? UNKNOWN_POWER_ROTOR_PERCENT : 0)
            }
            power={s?.fan2_mode === "manual" ? `${s.fan2_percent ?? 0}%` : s?.fan2_mode === "follow" ? `${s.percent}%` : fan2CurvePercent !== null ? `${fan2CurvePercent}%` : null}
            powerLabel={t("info.fan.requested")}
          />
        )}
      </div>

      {/* Processeur et carte graphique : absents avec un contrôleur ancien ; la GPU l'est aussi sans carte NVIDIA. */}
      {s?.cpu && (
        <div className={cn("grid gap-4", s.gpu ? "grid-cols-2" : "grid-cols-1")}>
          <CpuCard cpu={s.cpu} />
          {s.gpu && <GpuCard gpu={s.gpu} />}
        </div>
      )}

      {/* Mémoire/batterie et capteurs de la carte : présents seulement si le contrôleur les a lus. */}
      {(s?.ram || s?.battery || s?.sensors) && (
        <div className={cn("grid gap-4", s?.sensors ? "grid-cols-2" : "grid-cols-1")}>
          {(s?.ram || s?.battery) && <MemoryBatteryCard ram={s?.ram} battery={s?.battery} details={s?.battery_details} etaMin={s?.battery_eta_min} />}
          {s?.sensors && <SensorsCard sensors={s.sensors} />}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <SessionCard />
        <MachineCard />
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-xs">{t("info.last90")}</CardTitle>
          <p className="text-muted-foreground">{t("info.last90Hint")}</p>
        </CardHeader>
        <CardContent className="flex-1">
          <HistoryChart history={fan.history} />
        </CardContent>
      </Card>
    </div>
  )
}
