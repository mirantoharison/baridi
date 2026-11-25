import { useEffect, useMemo, useState } from "react"
import { Cpu, Moon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { GpuCard } from "@/components/hardware-cards"
import { LineChart, type ChartSeries } from "@/components/line-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type HistorySample } from "@/lib/api"
import type { Fan } from "@/lib/nav"

const PERIODS = [6, 24, 72]
const UNITS = { temp: "°C", usage: " %", power: " W" }

/** Page dédiée à la carte graphique : état détaillé, courbes en direct et sur plusieurs heures, programmes qui l'utilisent. */
export function GpuTab({ fan }: { fan: Fan }) {
  const { t } = useTranslation()
  const gpu = fan.status?.gpu
  const [hours, setHours] = useState(24)
  const [long, setLong] = useState<HistorySample[]>([])

  useEffect(() => {
    let isMounted = true
    api.history(hours, 300).then((s) => isMounted && setLong(s)).catch(() => {})
    return () => {
      isMounted = false
    }
  }, [hours])

  const live: ChartSeries[] = useMemo(
    () => [
      { id: "temp", label: t("gpu.temp"), color: "#c08a5a", values: fan.history.map((s) => s.gpuTemp), max: 100 },
      { id: "usage", label: t("gpu.usage"), color: "#7aa58a", values: fan.history.map((s) => s.gpuUsage), max: 100 },
      { id: "power", label: t("gpu.power"), color: "#a58ac0", values: fan.history.map((s) => s.gpuPower), max: Math.max(50, gpu?.power_limit_w ?? 0) },
    ],
    [fan.history, gpu?.power_limit_w, t],
  )
  const longSeries: ChartSeries[] = useMemo(
    () => [
      { id: "temp", label: t("gpu.temp"), color: "#c08a5a", values: long.map((s) => s.gpu_t), max: 100 },
      { id: "usage", label: t("gpu.usage"), color: "#7aa58a", values: long.map((s) => s.gpu_u), max: 100 },
      { id: "power", label: t("gpu.power"), color: "#a58ac0", values: long.map((s) => s.gpu_w), max: 100 },
    ],
    [long, t],
  )

  if (!gpu) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <Cpu className="size-4 text-muted-foreground" /> {t("gpu.title")}
          </CardTitle>
          <CardDescription>{t("gpu.none")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {gpu.asleep ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs">
              <Moon className="size-4 text-muted-foreground" /> {gpu.name || t("gpu.title")}
            </CardTitle>
            <CardDescription>{t("gpu.asleep", { state: gpu.power_state ?? "D3" })}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <GpuCard gpu={gpu} />
          <Card>
            <CardHeader>
              <CardTitle className="text-xs">{t("gpu.live")}</CardTitle>
              <CardDescription>{t("gpu.liveHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart series={live} unitOf={UNITS} />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xs">{t("gpu.long")}</CardTitle>
            <CardDescription>{t("gpu.longHint")}</CardDescription>
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
          <LineChart series={longSeries} unitOf={UNITS} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs">{t("gpu.processes")}</CardTitle>
          <CardDescription>{t("gpu.processesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {gpu.processes?.length ? (
            <ul className="flex flex-wrap gap-2">
              {gpu.processes.map((p) => (
                <li key={p} className="border bg-muted/40 px-2 py-0.5 font-mono">
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{gpu.asleep ? t("gpu.noneAsleep") : t("gpu.noneRunning")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
