import { useEffect, useMemo, useState } from "react"
import { Copy, FileBarChart, FileSpreadsheet, FolderOpen } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolled } from "@/hooks/use-polled"
import { api, type HistorySample } from "@/lib/api"
import { revealFile, saveTextFile, today } from "@/lib/files"
import { isTauri } from "@/lib/tauri"

const PERIODS = [7, 14]
/** Points demandés pour le rapport : assez pour des moyennes fines, sans alourdir la réponse. */
const REPORT_POINTS = 1000
/** Export CSV : toutes les mesures conservées (14 jours à une toutes les 30 s font ~40 000 lignes). */
const CSV_POINTS = 50000

/** Chiffres clés d'un rapport, calculés sur les mesures de la période. */
interface Report {
  samples: number
  days: number
  avgTemp: number
  maxTemp: number
  hoursAbove70: number
  hoursAbove80: number
  avgRpm: number
  maxRpm: number
  avgCpu: number | null
  maxGpuTemp: number | null
  avgGpuPower: number | null
  energyUsedWh: number
  energyChargedWh: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Calcule le rapport. Chaque mesure représente une durée égale (l'étendue des mesures divisée par leur nombre). */
function buildReport(samples: HistorySample[]): Report | null {
  if (samples.length < 2) return null
  const span = samples[samples.length - 1].t - samples[0].t
  const dt = span / (samples.length - 1) // secondes représentées par une mesure
  const temps = samples.map((s) => s.temp).filter((v): v is number => !!v)
  const rpms = samples.map((s) => s.rpm).filter((v): v is number => !!v)
  const cpus = samples.map((s) => s.cpu).filter((v): v is number => !!v)
  const gpuTemps = samples.map((s) => s.gpu_t).filter((v): v is number => !!v)
  const gpuPowers = samples.map((s) => s.gpu_w).filter((v): v is number => !!v)
  let used = 0
  let charged = 0
  for (const s of samples) {
    if (s.bat_w === undefined) continue
    if (s.bat_w < 0) used += (-s.bat_w * dt) / 3600
    else charged += (s.bat_w * dt) / 3600
  }
  return {
    samples: samples.length,
    days: span / 86400,
    avgTemp: mean(temps) ?? 0,
    maxTemp: temps.length ? Math.max(...temps) : 0,
    hoursAbove70: (temps.filter((v) => v >= 70).length * dt) / 3600,
    hoursAbove80: (temps.filter((v) => v >= 80).length * dt) / 3600,
    avgRpm: mean(rpms) ?? 0,
    maxRpm: rpms.length ? Math.max(...rpms) : 0,
    avgCpu: mean(cpus),
    maxGpuTemp: gpuTemps.length ? Math.max(...gpuTemps) : null,
    avgGpuPower: mean(gpuPowers),
    energyUsedWh: used,
    energyChargedWh: charged,
  }
}

/** CSV des mesures : une ligne par mesure, séparateur « ; » (Excel en français) et virgule décimale évitée en gardant des entiers. */
function toCsv(samples: HistorySample[]): string {
  const header = ["date", "temp_cpu_c", "ventilateur_pct", "rpm1", "rpm2", "charge_cpu_pct", "temp_gpu_c", "charge_gpu_pct", "puissance_gpu_w", "batterie_pct", "puissance_batterie_w", "secteur"]
  const rows = samples.map((s) =>
    [new Date(s.t * 1000).toISOString(), s.temp, s.pct, s.rpm, s.rpm2, s.cpu, s.gpu_t, s.gpu_u, s.gpu_w, s.bat, s.bat_w, s.ac === undefined ? "" : s.ac ? 1 : 0]
      .map((v) => (v === undefined ? "" : String(v)))
      .join(";"),
  )
  return [header.join(";"), ...rows].join("\n")
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

const FOULING_KEYS = { insufficient: "history.fouling.insufficient", ok: "history.fouling.ok", watch: "history.fouling.watch", clean: "history.fouling.clean" } as const

/** Rapport sur une période (7 ou 14 jours) : chiffres clés, répartition des températures, encrassement ; export CSV et texte. */
export function ReportsTab() {
  const { t } = useTranslation()
  const [days, setDays] = useState(7)
  const [samples, setSamples] = useState<HistorySample[] | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const thermal = usePolled(api.thermal, 60_000)
  const fouling = usePolled(api.fouling, 60_000)

  useEffect(() => {
    let isMounted = true
    setSamples(null)
    api.history(days * 24, REPORT_POINTS).then((s) => isMounted && setSamples(s)).catch(() => isMounted && setSamples([]))
    return () => {
      isMounted = false
    }
  }, [days])

  const report = useMemo(() => (samples ? buildReport(samples) : null), [samples])
  const h = (v: number) => `${v.toFixed(1)} h`
  const wh = (v: number) => `${v.toFixed(1)} Wh`

  /** Texte brut du rapport, pour le copier ou l'enregistrer. */
  const text = () => {
    if (!report) return ""
    const lines = [
      t("reports.title", { days }),
      "",
      `${t("reports.coverage")} : ${report.days.toFixed(1)} j (${report.samples})`,
      `${t("reports.avgTemp")} : ${report.avgTemp.toFixed(0)}°C`,
      `${t("reports.maxTemp")} : ${report.maxTemp}°C`,
      `${t("reports.above70")} : ${h(report.hoursAbove70)}`,
      `${t("reports.above80")} : ${h(report.hoursAbove80)}`,
      `${t("reports.avgRpm")} : ${Math.round(report.avgRpm)} RPM`,
      `${t("reports.maxRpm")} : ${report.maxRpm} RPM`,
      report.avgCpu !== null ? `${t("reports.avgCpu")} : ${report.avgCpu.toFixed(0)} %` : "",
      report.maxGpuTemp !== null ? `${t("reports.maxGpuTemp")} : ${report.maxGpuTemp}°C` : "",
      report.avgGpuPower !== null ? `${t("reports.avgGpuPower")} : ${report.avgGpuPower.toFixed(0)} W` : "",
      `${t("reports.energyUsed")} : ${wh(report.energyUsedWh)}`,
      `${t("reports.energyCharged")} : ${wh(report.energyChargedWh)}`,
      fouling ? `${t("reports.fouling")} : ${t(FOULING_KEYS[fouling.status])}` : "",
    ]
    return lines.filter(Boolean).join("\n")
  }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const exportCsv = () =>
    run(async () => {
      const all = await api.history(days * 24, CSV_POINTS)
      setSavedPath((await saveTextFile(`baridi-mesures-${days}j-${today()}.csv`, toCsv(all))).path)
    })
  const saveText = () => run(async () => setSavedPath((await saveTextFile(`baridi-rapport-${days}j-${today()}.txt`, text())).path))
  const copyText = () =>
    run(async () => {
      await navigator.clipboard.writeText(text())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })

  const totalSamples = thermal?.buckets.reduce((n, b) => n + b.samples, 0) ?? 0

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xs">
              <FileBarChart className="size-4 text-muted-foreground" /> {t("reports.heading")}
            </CardTitle>
            <CardDescription>{t("reports.description")}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {PERIODS.map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                {t("reports.period", { days: d })}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!samples ? (
            <p className="text-muted-foreground">{t("history.loading")}</p>
          ) : !report ? (
            <p className="text-muted-foreground">{t("history.empty")}</p>
          ) : (
            <>
              <Row label={t("reports.coverage")} value={`${report.days.toFixed(1)} j`} />
              <Row label={t("reports.avgTemp")} value={`${report.avgTemp.toFixed(0)}°C`} />
              <Row label={t("reports.maxTemp")} value={`${report.maxTemp}°C`} />
              <Row label={t("reports.above70")} value={h(report.hoursAbove70)} />
              <Row label={t("reports.above80")} value={h(report.hoursAbove80)} />
              <Row label={t("reports.avgRpm")} value={`${Math.round(report.avgRpm)} RPM`} />
              <Row label={t("reports.maxRpm")} value={`${report.maxRpm} RPM`} />
              {report.avgCpu !== null && <Row label={t("reports.avgCpu")} value={`${report.avgCpu.toFixed(0)} %`} />}
              {report.maxGpuTemp !== null && <Row label={t("reports.maxGpuTemp")} value={`${report.maxGpuTemp}°C`} />}
              {report.avgGpuPower !== null && <Row label={t("reports.avgGpuPower")} value={`${report.avgGpuPower.toFixed(0)} W`} />}
              <Row label={t("reports.energyUsed")} value={wh(report.energyUsedWh)} />
              <Row label={t("reports.energyCharged")} value={wh(report.energyChargedWh)} />
              {fouling && <Row label={t("reports.fouling")} value={t(FOULING_KEYS[fouling.status])} />}
            </>
          )}
        </CardContent>
      </Card>

      {thermal && totalSamples > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs">{t("reports.distribution")}</CardTitle>
            <CardDescription>{t("reports.distributionHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {thermal.buckets.map((b) => {
              const share = b.samples / totalSamples
              return (
                <div key={b.temp_c} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-muted-foreground">{b.temp_c}–{b.temp_c + 4}°</span>
                  <div className="h-2 flex-1 overflow-hidden bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-mono tabular-nums">{(share * 100).toFixed(1)} % · {Math.round(b.avg_percent)}%</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xs">{t("reports.exportTitle")}</CardTitle>
          <CardDescription>{t("reports.exportDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!report} onClick={exportCsv}>
              <FileSpreadsheet /> {t("reports.csv")}
            </Button>
            <Button variant="outline" disabled={!report} onClick={saveText}>
              <FileBarChart /> {t("reports.saveText")}
            </Button>
            <Button variant="outline" disabled={!report} onClick={copyText}>
              <Copy /> {copied ? t("reports.copied") : t("reports.copy")}
            </Button>
            {savedPath && isTauri && (
              <Button variant="ghost" onClick={() => revealFile(savedPath).catch(() => {})}>
                <FolderOpen /> {t("backup.reveal")}
              </Button>
            )}
          </div>
          {savedPath && <p className="break-all text-muted-foreground">{t("backup.saved", { path: savedPath })}</p>}
          {error && <p className="text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
