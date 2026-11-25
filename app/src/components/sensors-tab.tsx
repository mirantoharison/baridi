import { useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Sparkline } from "@/components/sparkline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { FanStatus } from "@/lib/api"
import type { Fan } from "@/lib/nav"
import { tempColor } from "@/lib/thermal"

/** Durée conservée pour la mini-courbe : ~2 minutes à une mesure par seconde. */
const KEEP = 120

interface Reading {
  id: string
  group: "temp" | "fan" | "load" | "power"
  value: number
  unit: string
}

/** Extrait du statut toutes les mesures disponibles ; une mesure absente ou nulle (capteur non géré) est omise. */
function readings(s: FanStatus): Reading[] {
  const out: Reading[] = []
  const add = (id: string, group: Reading["group"], value: number | undefined, unit: string) => {
    if (value !== undefined && Number.isFinite(value) && value !== 0) out.push({ id, group, value, unit })
  }
  add("cpuTemp", "temp", s.temp_c, "°C")
  const x = s.sensors
  add("boardLeft", "temp", x?.board_left_c, "°C")
  add("boardRight", "temp", x?.board_right_c, "°C")
  add("upCpu", "temp", x?.up_cpu_c, "°C")
  add("gpuTemp", "temp", s.gpu && !s.gpu.asleep ? s.gpu.temp_c : undefined, "°C")
  add("gpuLeft", "temp", x?.gpu_left_c, "°C")
  add("gpuRight", "temp", x?.gpu_right_c, "°C")
  add("gpuVram", "temp", x?.gpu_vram_c, "°C")
  add("gpuVrm", "temp", x?.gpu_vrm_c, "°C")
  add("rpm1", "fan", s.rpm, "RPM")
  add("rpm2", "fan", s.fan2_rpm, "RPM")
  add("fanPercent", "fan", s.percent, "%")
  add("cpuUsage", "load", s.cpu?.usage_percent, "%")
  add("cpuFreq", "load", s.cpu?.freq_mhz, "MHz")
  add("gpuUsage", "load", s.gpu && !s.gpu.asleep ? s.gpu.usage_percent : undefined, "%")
  add("gpuClock", "load", s.gpu && !s.gpu.asleep ? s.gpu.clock_mhz : undefined, "MHz")
  add("ram", "load", s.ram?.usage_percent, "%")
  add("gpuPower", "power", s.gpu && !s.gpu.asleep ? s.gpu.power_w : undefined, "W")
  add("batPower", "power", s.battery_details?.has_power ? Math.abs(s.battery_details.power_w) : undefined, "W")
  add("cpuPowerRaw", "power", x?.cpu_power_raw, "raw")
  add("cpuVoltageRaw", "power", x?.cpu_voltage_raw, "raw")
  return out
}

interface Track {
  min: number
  max: number
  series: number[]
}

/** Mini, maxi et courbe récente de chaque mesure depuis l'ouverture de la page. */
function useTracks(status: FanStatus | null) {
  const ref = useRef(new Map<string, Track>())
  const [, bump] = useState(0)
  useEffect(() => {
    if (!status) return
    for (const r of readings(status)) {
      const track = ref.current.get(r.id) ?? { min: r.value, max: r.value, series: [] }
      track.min = Math.min(track.min, r.value)
      track.max = Math.max(track.max, r.value)
      track.series.push(r.value)
      if (track.series.length > KEEP) track.series.shift()
      ref.current.set(r.id, track)
    }
    bump((n) => n + 1)
  }, [status])
  return { tracks: ref.current, reset: () => { ref.current.clear(); bump((n) => n + 1) } }
}

/** Couleur de la courbe : les températures suivent l'échelle thermique de l'application, les autres groupes ont leur teinte. */
const GROUP_COLORS: Record<Reading["group"], string> = { temp: "var(--cool)", fan: "#8b9bb4", load: "#7aa58a", power: "#a58ac0" }
function curveColor(r: Reading): string {
  return r.group === "temp" ? tempColor(r.value) : GROUP_COLORS[r.group]
}

const GROUPS: Reading["group"][] = ["temp", "fan", "load", "power"]

/** Tableau en direct de tous les capteurs lisibles : valeur, mini, maxi et tendance depuis l'ouverture de la page. */
export function SensorsTab({ fan }: { fan: Fan }) {
  const { t } = useTranslation()
  const { tracks, reset } = useTracks(fan.status)
  const list = fan.status ? readings(fan.status) : []
  const fmt = (v: number, unit: string) => (unit === "°C" ? `${Math.round(v)}°C` : `${Math.round(v)} ${unit === "raw" ? "" : unit}`.trim())

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xs">{t("sensors.title")}</CardTitle>
            <CardDescription>{t("sensors.description")}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw /> {t("sensors.reset")}
          </Button>
        </CardHeader>
      </Card>

      {GROUPS.map((g) => {
        const rows = list.filter((r) => r.group === g)
        if (!rows.length) return null
        return (
          <Card key={g}>
            <CardHeader>
              <CardTitle className="text-xs">{t(`sensors.groups.${g}`)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="grid grid-cols-[1fr_5rem_5rem_5rem_7.5rem] gap-3 text-muted-foreground">
                <span />
                <span className="text-right">{t("sensors.current")}</span>
                <span className="text-right">{t("sensors.min")}</span>
                <span className="text-right">{t("sensors.max")}</span>
                <span />
              </div>
              {rows.map((r) => {
                const tr = tracks.get(r.id)
                return (
                  <div key={r.id} className="grid grid-cols-[1fr_5rem_5rem_5rem_7.5rem] items-center gap-3">
                    <span>{t(`sensors.names.${r.id}`)}</span>
                    <span className="text-right font-mono font-semibold tabular-nums">{fmt(r.value, r.unit)}</span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">{tr ? fmt(tr.min, r.unit) : "–"}</span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">{tr ? fmt(tr.max, r.unit) : "–"}</span>
                    <Sparkline values={tr?.series ?? []} color={curveColor(r)} />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
      {list.length === 0 && <p className="text-muted-foreground">{t("sensors.empty")}</p>}
    </div>
  )
}
