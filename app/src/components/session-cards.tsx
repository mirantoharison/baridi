import { Activity, Laptop } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api } from "@/lib/api"

/** « 2 h 03 min », « 45 min » ou « 30 s » : l'unité la plus grosse utile, sans zéros de tête. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, "0")} min`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

const STATS_REFRESH_MS = 10_000
const SYSTEM_REFRESH_MS = 60_000

/**
 * Statistiques de la session, calculées par le contrôleur (qui tourne en permanence) : températures extrêmes et moyenne,
 * temps passé au-dessus de seuils. Elles repartent de zéro quand le contrôleur redémarre.
 */
export function SessionCard() {
  const stats = usePolled(api.stats, STATS_REFRESH_MS)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Activity className="size-4 text-muted-foreground" /> Session
        </CardTitle>
        <p className="text-muted-foreground">Depuis le démarrage du contrôleur.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!stats || stats.samples === 0 ? (
          <p className="text-muted-foreground">Pas encore de mesures.</p>
        ) : (
          <>
            <Row label="Durée" value={formatDuration(stats.uptime_s)} />
            <Row label="Température minimale" value={`${stats.min_temp_c}°C`} />
            <Row label="Température moyenne" value={`${stats.avg_temp_c.toFixed(1)}°C`} />
            <Row label="Température maximale" value={`${stats.max_temp_c}°C`} />
            <Row label="Au-dessus de 70°" value={formatDuration(stats.seconds_above_70)} />
            <Row label="Au-dessus de 80°" value={formatDuration(stats.seconds_above_80)} />
            <Row label="Au-dessus de 90°" value={formatDuration(stats.seconds_above_90)} />
            <Row label="Ventilateur, vitesse maximale" value={`${stats.max_rpm} RPM`} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Identité de la machine : modèle, BIOS, plan d'alimentation, durée depuis le démarrage de Windows. */
export function MachineCard() {
  const info = usePolled(api.system, SYSTEM_REFRESH_MS)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Laptop className="size-4 text-muted-foreground" /> Machine
        </CardTitle>
        {info?.model && <p className="truncate text-muted-foreground" title={info.model}>{info.model}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {!info ? (
          <p className="text-muted-foreground">Lecture en cours…</p>
        ) : (
          <>
            {info.manufacturer && <Row label="Fabricant" value={info.manufacturer} />}
            {info.bios_version && <Row label="BIOS" value={`${info.bios_version}${info.bios_date ? ` · ${info.bios_date}` : ""}`} />}
            {info.power_plan && <Row label="Plan d'alimentation" value={info.power_plan} />}
            <Row label="Windows démarré depuis" value={formatDuration(info.uptime_s)} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
