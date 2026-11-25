import { Activity, Laptop } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api } from "@/lib/api"

/** « 2 h 03 min », « 45 min » ou « 30 s » : l'unité la plus grosse utile, sans zéros de tête. */
function formatDuration(totalSeconds: number, t: TFunction): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return t("info.duration.s", { n: s })
  const min = Math.floor(s / 60)
  if (min < 60) return t("info.duration.min", { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t("info.duration.hm", { h, m: String(min % 60).padStart(2, "0") })
  return t("info.duration.dh", { d: Math.floor(h / 24), h: h % 24 })
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
  const { t } = useTranslation()
  const stats = usePolled(api.stats, STATS_REFRESH_MS)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Activity className="size-4 text-muted-foreground" /> {t("info.session.title")}
        </CardTitle>
        <p className="text-muted-foreground">{t("info.session.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!stats || stats.samples === 0 ? (
          <p className="text-muted-foreground">{t("info.session.none")}</p>
        ) : (
          <>
            <Row label={t("info.session.duration")} value={formatDuration(stats.uptime_s, t)} />
            <Row label={t("info.session.min")} value={`${stats.min_temp_c}°C`} />
            <Row label={t("info.session.avg")} value={`${stats.avg_temp_c.toFixed(1)}°C`} />
            <Row label={t("info.session.max")} value={`${stats.max_temp_c}°C`} />
            <Row label={t("info.session.above70")} value={formatDuration(stats.seconds_above_70, t)} />
            <Row label={t("info.session.above80")} value={formatDuration(stats.seconds_above_80, t)} />
            <Row label={t("info.session.above90")} value={formatDuration(stats.seconds_above_90, t)} />
            <Row label={t("info.session.maxRpm")} value={`${stats.max_rpm} RPM`} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Identité de la machine : modèle, BIOS, plan d'alimentation, durée depuis le démarrage de Windows. */
export function MachineCard() {
  const { t } = useTranslation()
  const info = usePolled(api.system, SYSTEM_REFRESH_MS)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Laptop className="size-4 text-muted-foreground" /> {t("info.machine.title")}
        </CardTitle>
        {info?.model && <p className="truncate text-muted-foreground" title={info.model}>{info.model}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {!info ? (
          <p className="text-muted-foreground">{t("info.machine.reading")}</p>
        ) : (
          <>
            {info.manufacturer && <Row label={t("info.machine.manufacturer")} value={info.manufacturer} />}
            {info.bios_version && <Row label={t("info.machine.bios")} value={`${info.bios_version}${info.bios_date ? ` · ${info.bios_date}` : ""}`} />}
            {info.power_plan && <Row label={t("info.machine.powerPlan")} value={info.power_plan} />}
            <Row label={t("info.machine.uptime")} value={formatDuration(info.uptime_s, t)} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
