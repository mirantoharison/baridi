import { useEffect, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { AlertTriangle, CheckCircle2, Circle, ClipboardCopy, Loader2, MinusCircle, Play, Square, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { FanTestCard } from "@/components/fan-test-card"
import { InfoNote } from "@/components/info-note"
import { api } from "@/lib/api"
import type { Fan } from "@/lib/nav"
import { call, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"

type State = "pending" | "running" | "ok" | "warn" | "fail" | "skipped"

interface Check {
  id: string
  state: State
  detail?: string
}

const INITIAL_CHECKS: Check[] = ["api", "stream", "temp", "fan2", "service", "fan"].map((id) => ({ id, state: "pending" as State }))

/** Test actif refusé au-dessus : un ventilateur à 30 % sur un processeur déjà chaud serait imprudent. */
const ACTIVE_TEST_MAX_TEMP_C = 75
const LOW_PERCENT = 30
const HIGH_PERCENT = 80
/** Le RPM met quelques secondes à se stabiliser après une consigne : on attend au plus ce délai. */
const SETTLE_TIMEOUT_MS = 12_000
/** RPM considéré stable quand les 3 derniers relevés sont dans cet écart. */
const SETTLE_TOLERANCE_RPM = 40
/** Seuils indicatifs de l'écart de RPM entre 80 % et 30 % pour juger que le ventilateur suit la consigne. */
const MIN_DELTA_OK_RPM = 300
const MIN_DELTA_WARN_RPM = 100

const STATE_ICON: Record<State, { icon: typeof Circle; className: string }> = {
  pending: { icon: Circle, className: "text-muted-foreground/50" },
  running: { icon: Loader2, className: "animate-spin text-foreground" },
  ok: { icon: CheckCircle2, className: "text-green-500" },
  warn: { icon: AlertTriangle, className: "text-amber-500" },
  fail: { icon: XCircle, className: "text-hot" },
  skipped: { icon: MinusCircle, className: "text-muted-foreground" },
}


class Aborted extends Error {}

/** Attente interruptible : le bouton Annuler (ou la fermeture de la page) coupe le test sans attendre la fin du délai. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted())
    const timer = setTimeout(() => resolve(), ms)
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Aborted()) }, { once: true })
  })
}

/** Texte brut du rapport : ne contient que des états et des mesures, rien de personnel. */
function buildReport(checks: Check[], fan: Fan, t: TFunction, locale: string): string {
  const s = fan.status
  const lines = checks.map((c) => `[${t(`diagnostic.states.${c.state}`)}] ${t(`diagnostic.checks.${c.id}`)}${c.detail ? ` — ${c.detail}` : ""}`)
  const context = s
    ? t("diagnostic.report.context", { mode: s.mode, profile: s.profile, curve: s.curve_mode, temp: s.temp_c, rpm: s.rpm, percent: s.percent })
    : t("diagnostic.report.noStatus")
  return [t("diagnostic.report.title", { date: new Date().toLocaleString(locale) }), context, "", ...lines].join("\n")
}

/**
 * Diagnostic guidé : vérifie la chaîne contrôleur → matériel et, en option, que le ventilateur suit réellement une consigne.
 * Le test actif change temporairement la vitesse puis restaure le mode d'origine, même en cas d'annulation ou d'erreur.
 */
export function DiagnosticTab({ fan }: { fan: Fan }) {
  const { t, i18n } = useTranslation()
  const [checks, setChecks] = useState<Check[]>(INITIAL_CHECKS)
  const [running, setRunning] = useState(false)
  const [withActiveTest, setWithActiveTest] = useState(true)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Les relevés du test actif lisent le flux SSE (1 Hz) via une ref : interroger /status en boucle polluerait le journal des requêtes.
  const fanRef = useRef(fan)
  fanRef.current = fan

  // Fermer la page pendant un test l'annule (et la restauration s'exécute dans le finally du test).
  useEffect(() => () => abortRef.current?.abort(), [])

  const set = (id: string, state: State, detail?: string) =>
    setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, state, detail } : c)))

  /** Attend que le RPM se stabilise après une consigne ; renvoie le dernier relevé. */
  const settleRpm = async (signal: AbortSignal): Promise<number> => {
    const samples: number[] = []
    const deadline = Date.now() + SETTLE_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(1000, signal)
      samples.push(fanRef.current.status?.rpm ?? 0)
      const last = samples.slice(-3)
      if (last.length === 3 && Math.max(...last) - Math.min(...last) <= SETTLE_TOLERANCE_RPM) break
    }
    return samples[samples.length - 1] ?? 0
  }

  const runActiveTest = async (signal: AbortSignal) => {
    const before = fanRef.current.status
    if (!before) return set("fan", "skipped", t("diagnostic.details.noStatus"))
    if (before.temp_c >= ACTIVE_TEST_MAX_TEMP_C) {
      return set("fan", "skipped", t("diagnostic.details.tooHot", { temp: before.temp_c, limit: ACTIVE_TEST_MAX_TEMP_C }))
    }
    set("fan", "running", `${LOW_PERCENT} %…`)
    try {
      await fanRef.current.setManual(LOW_PERCENT)
      const lowRpm = await settleRpm(signal)
      set("fan", "running", `${HIGH_PERCENT} %…`)
      await fanRef.current.setManual(HIGH_PERCENT)
      const highRpm = await settleRpm(signal)

      const summary = `${LOW_PERCENT} % → ${lowRpm} RPM · ${HIGH_PERCENT} % → ${highRpm} RPM`
      const delta = highRpm - lowRpm
      if (lowRpm === 0 && highRpm === 0) set("fan", "fail", t("diagnostic.details.noRotation", { summary }))
      else if (delta >= MIN_DELTA_OK_RPM) set("fan", "ok", summary)
      else if (delta >= MIN_DELTA_WARN_RPM) set("fan", "warn", t("diagnostic.details.weak", { summary }))
      else set("fan", "fail", t("diagnostic.details.notFollowing", { summary }))
    } finally {
      // IMPORTANT : on rend toujours la main dans l'état d'origine, test terminé, annulé ou en erreur.
      const f = fanRef.current
      if (before.mode === "auto") await f.setAuto()
      else {
        await f.setManual(before.percent)
        if (before.mode === "idle") await f.stop()
      }
    }
  }

  const run = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller
    setChecks(INITIAL_CHECKS)
    setCopied(false)
    setRunning(true)
    try {
      // 1. Contrôleur joignable
      set("api", "running")
      const started = performance.now()
      try {
        await api.status()
        set("api", "ok", t("diagnostic.details.responded", { ms: Math.round(performance.now() - started) }))
      } catch (e) {
        set("api", "fail", (e as Error).message)
        for (const id of ["stream", "temp", "fan2", "service", "fan"]) set(id, "skipped", t("diagnostic.details.unreachable"))
        return
      }

      // 2. Flux SSE
      set("stream", fanRef.current.online ? "ok" : "fail", fanRef.current.online ? t("diagnostic.details.streamOk") : t("diagnostic.details.streamDown"))

      // 3. Température
      const temp = fanRef.current.status?.temp_c
      if (temp === undefined) set("temp", "fail", t("diagnostic.details.noMeasure"))
      else if (temp <= 0) set("temp", "fail", t("diagnostic.details.unreadable"))
      else if (temp > 110) set("temp", "warn", t("diagnostic.details.absurd", { temp }))
      else set("temp", "ok", `${temp}°`)

      // 3 bis. Nombre de ventilateurs, tel que l'annonce la DLL ASUS : informatif — un seul est parfaitement normal.
      const fanCount = fanRef.current.status?.fan_count
      const rpm2 = fanRef.current.status?.fan2_rpm
      if (fanCount === undefined) {
        // Contrôleur ancien (sans fan_count) : on se rabat sur la seule mesure du second ventilateur.
        if (rpm2 === undefined) set("fan2", "skipped", t("diagnostic.details.fan2None"))
        else set("fan2", "ok", t("diagnostic.details.fan2Detected", { rpm: rpm2 }))
      } else if (fanCount < 0) set("fan2", "skipped", t("diagnostic.details.fan2Unknown"))
      else if (fanCount <= 1) set("fan2", "ok", t("diagnostic.details.fanCountOne", { count: fanCount }))
      else if (rpm2 !== undefined) set("fan2", "ok", t("diagnostic.details.fanCountSpinning", { count: fanCount, rpm: rpm2 }))
      else set("fan2", "warn", t("diagnostic.details.fanCountUnconfirmed", { count: fanCount }))

      // 4. Service Windows
      if (!isTauri) set("service", "skipped", t("diagnostic.details.serviceOnlyInstalled"))
      else {
        try {
          const state = await call<string>("service_status")
          if (state === "running") set("service", "ok", t("diagnostic.details.serviceRunning"))
          else if (state === "stopped") set("service", "warn", t("diagnostic.details.serviceStopped"))
          else set("service", "ok", t("diagnostic.details.serviceNone"))
        } catch (e) {
          set("service", "warn", typeof e === "string" ? e : (e as Error).message)
        }
      }

      // 5. Test actif
      if (withActiveTest) await runActiveTest(signal)
      else set("fan", "skipped", t("diagnostic.details.activeDisabled"))
    } catch (e) {
      if (!(e instanceof Aborted)) throw e
      setChecks((cs) => cs.map((c) => (c.state === "running" || c.state === "pending" ? { ...c, state: "skipped", detail: t("diagnostic.details.cancelled") } : c)))
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(checks, fan, t, i18n.language))
      setCopied(true)
    } catch {
      /* presse-papiers refusé : l'utilisateur peut sélectionner la liste à la main */
    }
  }

  const finished = !running && checks.some((c) => c.state !== "pending")

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote summary={<Trans i18nKey="diagnostic.summary" components={{ b: <b /> }} />}>
        <Trans i18nKey="diagnostic.detailsNote" values={{ max: ACTIVE_TEST_MAX_TEMP_C, delta: MIN_DELTA_OK_RPM }} components={{ b: <b /> }} />
      </InfoNote>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="text-xs">{t("diagnostic.card.title")}</CardTitle>
            <CardDescription>{t("diagnostic.card.subtitle")}</CardDescription>
          </div>
          <div className="flex gap-1.5">
            {running ? (
              <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square /> {t("diagnostic.card.cancel")}
              </Button>
            ) : (
              <Button size="sm" onClick={run}>
                <Play /> {t("diagnostic.card.run")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={copy} disabled={!finished}>
              <ClipboardCopy /> {copied ? t("diagnostic.card.copied") : t("diagnostic.card.copy")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-none border p-3">
            <Label htmlFor="active-test" className="flex flex-col items-start gap-1">
              <span className="font-medium">{t("diagnostic.card.includeActive")}</span>
              <span className="font-normal text-muted-foreground">{t("diagnostic.card.includeActiveHint")}</span>
            </Label>
            <Switch id="active-test" checked={withActiveTest} disabled={running} onCheckedChange={setWithActiveTest} />
          </div>

          <ul className="divide-y rounded-none border">
            {checks.map((c) => {
              const { icon: Icon, className } = STATE_ICON[c.state]
              return (
                <li key={c.id} className="flex items-start gap-3 p-3">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t(`diagnostic.checks.${c.id}`)}</div>
                    {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
                  </div>
                  <span className="shrink-0 text-muted-foreground">{t(`diagnostic.states.${c.state}`)}</span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <FanTestCard hasFan2={(fan.status?.fan_count ?? 0) >= 2} />
    </div>
  )
}
