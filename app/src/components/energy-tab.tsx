import { useEffect, useMemo, useState } from "react"
import { BatteryFull, HeartPulse } from "lucide-react"
import { useTranslation } from "react-i18next"
import { LineChart, type ChartSeries } from "@/components/line-chart"
import { PowerPlanCard } from "@/components/power-plan-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api, type HistorySample } from "@/lib/api"
import type { Fan } from "@/lib/nav"

const PERIODS = [6, 24, 72]
const UNITS = { level: " %", power: " W" }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

/** Durée en minutes → « 2 h 05 ». */
function duration(min: number): string {
  return `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`
}

/** Énergie et batterie : état et autonomie, courbe de niveau/puissance, usure suivie jour après jour, plan d'alimentation. */
export function EnergyTab({ fan }: { fan: Fan }) {
  const { t } = useTranslation()
  const s = fan.status
  const bat = s?.battery
  const d = s?.battery_details
  const [hours, setHours] = useState(24)
  const [samples, setSamples] = useState<HistorySample[]>([])
  const health = usePolled(api.batteryHealth, 5 * 60_000)

  useEffect(() => {
    let isMounted = true
    api.history(hours, 300).then((r) => isMounted && setSamples(r)).catch(() => {})
    return () => {
      isMounted = false
    }
  }, [hours])

  const series: ChartSeries[] = useMemo(
    () => [
      { id: "level", label: t("energy.level"), color: "#7aa58a", values: samples.map((x) => x.bat), max: 100 },
      // IMPORTANT : la puissance est signée (négative en décharge) ; on trace sa valeur absolue sur 0–60 W, l'échelle d'un portable.
      { id: "power", label: t("energy.power"), color: "#c08a5a", values: samples.map((x) => (x.bat_w === undefined ? undefined : Math.abs(x.bat_w))), max: 60 },
    ],
    [samples, t],
  )

  if (!bat?.present) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs">
              <BatteryFull className="size-4 text-muted-foreground" /> {t("energy.title")}
            </CardTitle>
            <CardDescription>{t("energy.none")}</CardDescription>
          </CardHeader>
        </Card>
        <PowerPlanCard />
      </div>
    )
  }

  const state = bat.charging ? t("energy.charging") : bat.plugged_in ? t("energy.pluggedIn") : t("energy.onBattery")
  const eta = s?.battery_eta_min
  const first = health?.[0]
  const last = health && health.length ? health[health.length - 1] : undefined
  const wearTrend = first && last && first.date !== last.date ? last.wear_percent - first.wear_percent : null

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <BatteryFull className="size-4 text-muted-foreground" /> {t("energy.title")}
          </CardTitle>
          <CardDescription>{t("energy.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-semibold tabular-nums">{bat.percent}%</span>
            <span className="text-muted-foreground">{state}</span>
          </div>
          <div className="h-2 overflow-hidden bg-muted" role="presentation">
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${bat.percent}%` }} />
          </div>
          {eta !== undefined && !bat.plugged_in && <Row label={t("energy.eta")} value={duration(eta)} />}
          {bat.plugged_in === false && bat.minutes_left > 0 && eta === undefined && <Row label={t("energy.etaWindows")} value={duration(bat.minutes_left)} />}
          {d?.has_power && <Row label={d.power_w >= 0 ? t("energy.chargingPower") : t("energy.drawPower")} value={`${Math.abs(d.power_w).toFixed(1)} W`} />}
          {d && <Row label={t("energy.voltage")} value={`${(d.voltage_mv / 1000).toFixed(2)} V`} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xs">{t("energy.chart")}</CardTitle>
            <CardDescription>{t("energy.chartHint")}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {PERIODS.map((h) => (
              <Button key={h} size="sm" variant={hours === h ? "default" : "outline"} onClick={() => setHours(h)}>
                {h} h
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <LineChart series={series} unitOf={UNITS} />
        </CardContent>
      </Card>

      {d && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs">
              <HeartPulse className="size-4 text-muted-foreground" /> {t("energy.health")}
            </CardTitle>
            <CardDescription>{t("energy.healthHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label={t("energy.wear")} value={`${d.wear_percent.toFixed(1)} %`} />
            <Row label={t("energy.capacity")} value={`${(d.full_charged_mwh / 1000).toFixed(1)} Wh / ${(d.designed_mwh / 1000).toFixed(1)} Wh`} />
            {(d.cycle_count > 0 || s?.sensors?.battery_cycles) && <Row label={t("energy.cycles")} value={String(d.cycle_count || s?.sensors?.battery_cycles)} />}
            {d.chemistry && <Row label={t("energy.chemistry")} value={d.chemistry} />}
            {wearTrend !== null && first && <Row label={t("energy.trend", { date: first.date })} value={`${wearTrend >= 0 ? "+" : ""}${wearTrend.toFixed(1)} %`} />}
            {health && health.length > 1 && (
              <div className="pt-2">
                <LineChart
                  unitOf={{ wear: " %" }}
                  series={[{ id: "wear", label: t("energy.wear"), color: "#c08a5a", values: health.map((p) => p.wear_percent), max: Math.max(10, ...health.map((p) => p.wear_percent)) * 1.2 }]}
                />
                <p className="mt-1 text-muted-foreground">{t("energy.days", { count: health.length })}</p>
              </div>
            )}
            {(!health || health.length < 2) && <p className="text-muted-foreground">{t("energy.trendWait")}</p>}
          </CardContent>
        </Card>
      )}

      <PowerPlanCard />
    </div>
  )
}
