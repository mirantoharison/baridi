import { Thermometer, Wind } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoNote } from "@/components/info-note"
import { FanRotor } from "@/components/fan-rotor"
import { CpuCard, GpuCard, MemoryBatteryCard, SensorsCard } from "@/components/hardware-cards"
import { MachineCard, SessionCard } from "@/components/session-cards"
import { HistoryChart } from "@/components/history-chart"
import { TempGauge } from "@/components/temp-gauge"
import type { Fan } from "@/lib/nav"
import { cn } from "@/lib/utils"

/** Animation de la roue du second ventilateur quand sa puissance est inconnue : assez lente pour ne pas suggérer une vitesse précise. */
const UNKNOWN_POWER_ROTOR_PERCENT = 30

/** Carte d'un ventilateur : roue animée, vitesse mesurée et, si connue, puissance demandée. */
function FanCard({ title, rpm, rotorPercent, power, powerLabel = "Puissance" }: {
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
            {power === null ? "Piloté par le BIOS" : <>{powerLabel} <span className="font-mono text-foreground">{power}</span></>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** État en direct du contrôleur : jauge de température, ventilateur(s) et historique récent. Lecture seule. */
export function InfoTab({ fan }: { fan: Fan }) {
  const s = fan.status
  const fan2Rpm = s?.fan2_rpm
  const hasFan2 = fan2Rpm !== undefined

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote
        summary={
          <>
          Cette page affiche l'état <b>en direct</b> de ta machine, tel que le voit le contrôleur Go qui pilote le ventilateur. Les mesures arrivent en continu et sont rafraîchies <b>chaque seconde</b> : la <b>température CPU</b>, le ou les <b>ventilateurs</b> (vitesse mesurée en RPM et puissance demandée), puis le <b>processeur</b>, la <b>carte graphique</b> NVIDIA, la <b>mémoire</b> et la <b>batterie</b>, enfin les <b>statistiques de la session</b>, l'identité de la <b>machine</b> et un <b>historique</b> des 90 dernières secondes où tu choisis les courbes à superposer. C'est la page à garder ouverte, ou à consulter de temps en temps, pour vérifier d'un coup d'œil que tout se passe comme prévu : elle est en lecture seule, et les réglages se trouvent dans les autres pages. Si la barre d'état en bas indique que la connexion au contrôleur est perdue, ce que tu vois ici n'est plus à jour.
          </>
        }
      >
        La <b>température CPU</b> est lue via la DLL ASUS : la jauge est <b>bleue</b> sous 65° (« frais » sous 50°, « tiède » de 50° à 64°), <b>orange</b> et « chaud » de 65° à 79°, puis <b>rouge</b> et « critique » dès 80°, sur une échelle de 0° à 100°. Dans la carte <b>Ventilateur</b>, les RPM sont la vitesse réellement mesurée, et la <b>puissance</b> la consigne envoyée (PWM de 0 à 255 converti en %) : les deux peuvent différer un instant, car le contrôleur rejoint la consigne par petites étapes. Avec deux ventilateurs, une troisième carte apparaît ; « Piloté par le BIOS » signifie que la carte mère décide seule. La carte <b>Processeur</b> donne la charge, la fréquence réelle, la charge par thread et une pastille « Limitation probable » quand la fréquence reste nettement sous la base alors que le processeur est chargé (c'est une déduction, pas une lecture directe). La carte <b>graphique</b> ajoute la température, la mémoire, la consommation face à son plafond, l'état de performance P0 à P15 et les raisons de ralentissement : seule la <b>protection thermique</b> est une vraie alerte, le « plafond thermique plateforme » est déclaré en permanence par les portables et reste informatif. <b>Mémoire et batterie</b>, <b>capteurs de la carte</b> (ceux que ton modèle gère, la puissance et la tension du CPU étant des valeurs brutes sans unité documentée), <b>Session</b> (températures extrêmes et temps passé au-dessus de 70, 80 et 90°, remis à zéro au redémarrage du contrôleur) et <b>Machine</b> (modèle, BIOS, plan d'alimentation) complètent la page. Le graphe retrace les <b>90 dernières secondes</b>, un point par seconde : la température CPU et le ventilateur y sont toujours, les autres séries s'activent d'un clic sur leur pastille, sur une échelle commune de 0 à 100. Cet historique n'est gardé qu'en mémoire : il repart de zéro à chaque ouverture. Si la connexion est coupée, l'application retente toute seule toutes les secondes et demie.
      </InfoNote>

      {/* 2 cartes sur une machine à un ventilateur, 3 dès que le second a été détecté (le contrôleur n'envoie fan2_rpm qu'après l'avoir vu tourner). */}
      <div className={cn("grid gap-4", hasFan2 ? "grid-cols-3" : "grid-cols-2")}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs">
              <Thermometer className="size-4 text-muted-foreground" /> Température CPU
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 items-center justify-center">
            <TempGauge temp={s?.temp_c ?? 0} />
          </CardContent>
        </Card>

        <FanCard
          title={hasFan2 ? "Ventilateur 1" : "Ventilateur"}
          rpm={s?.rpm ?? 0}
          rotorPercent={s?.percent ?? 0}
          // En mode BIOS la consigne du contrôleur est ignorée par le matériel : l'afficher serait trompeur.
          power={s?.bios_override ? null : `${s?.percent ?? 0}%`}
        />

        {fan2Rpm !== undefined && (
          <FanCard
            title="Ventilateur 2"
            rpm={fan2Rpm}
            // En mode « firmware » la consigne vient de la carte mère : aucune puissance à afficher, et la roue tourne à
            // vitesse fixe tant qu'il tourne. En « suivre » il reçoit la consigne du ventilateur 1, en « manuel » la sienne.
            rotorPercent={
              s?.fan2_mode === "manual" ? (s.fan2_percent ?? 0) : s?.fan2_mode === "follow" ? s.percent : fan2Rpm > 0 ? UNKNOWN_POWER_ROTOR_PERCENT : 0
            }
            power={s?.fan2_mode === "manual" ? `${s.fan2_percent ?? 0}%` : s?.fan2_mode === "follow" ? `${s.percent}%` : null}
            powerLabel="Consigne demandée"
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
          <CardTitle className="text-xs">Dernières 90 secondes</CardTitle>
          <p className="text-muted-foreground">Coche des séries pour les superposer (échelle commune 0–100).</p>
        </CardHeader>
        <CardContent className="flex-1">
          <HistoryChart history={fan.history} />
        </CardContent>
      </Card>
    </div>
  )
}
