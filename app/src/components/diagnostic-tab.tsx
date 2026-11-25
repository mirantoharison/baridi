import { useEffect, useRef, useState } from "react"
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
  label: string
  state: State
  detail?: string
}

const INITIAL_CHECKS: Check[] = [
  { id: "api", label: "Contrôleur joignable", state: "pending" },
  { id: "stream", label: "Flux de mesures en direct", state: "pending" },
  { id: "temp", label: "Lecture de la température", state: "pending" },
  { id: "fan2", label: "Nombre de ventilateurs", state: "pending" },
  { id: "service", label: "Service Windows", state: "pending" },
  { id: "fan", label: "Réponse du ventilateur (test actif)", state: "pending" },
]

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

const STATE_LABEL: Record<State, string> = { pending: "En attente", running: "En cours", ok: "OK", warn: "Attention", fail: "Échec", skipped: "Ignoré" }

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
function buildReport(checks: Check[], fan: Fan): string {
  const s = fan.status
  const lines = checks.map((c) => `[${STATE_LABEL[c.state]}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`)
  const context = s
    ? `Mode ${s.mode}, profil ${s.profile}, courbe ${s.curve_mode}, ${s.temp_c}°C, ${s.rpm} RPM (${s.percent} %)`
    : "Statut indisponible"
  return [`Baridi - Fancontroller — diagnostic du ${new Date().toLocaleString()}`, context, "", ...lines].join("\n")
}

/**
 * Diagnostic guidé : vérifie la chaîne contrôleur → matériel et, en option, que le ventilateur suit réellement une consigne.
 * Le test actif change temporairement la vitesse puis restaure le mode d'origine, même en cas d'annulation ou d'erreur.
 */
export function DiagnosticTab({ fan }: { fan: Fan }) {
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
    if (!before) return set("fan", "skipped", "statut indisponible")
    if (before.temp_c >= ACTIVE_TEST_MAX_TEMP_C) {
      return set("fan", "skipped", `processeur à ${before.temp_c}° (limite ${ACTIVE_TEST_MAX_TEMP_C}°) : test refusé par prudence`)
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
      if (lowRpm === 0 && highRpm === 0) set("fan", "fail", `${summary} : aucune rotation mesurée (capteur illisible ou ventilateur arrêté)`)
      else if (delta >= MIN_DELTA_OK_RPM) set("fan", "ok", summary)
      else if (delta >= MIN_DELTA_WARN_RPM) set("fan", "warn", `${summary} : réponse faible (seuils indicatifs)`)
      else set("fan", "fail", `${summary} : le ventilateur ne suit pas la consigne`)
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
        set("api", "ok", `réponse en ${Math.round(performance.now() - started)} ms`)
      } catch (e) {
        set("api", "fail", (e as Error).message)
        for (const id of ["stream", "temp", "fan2", "service", "fan"]) set(id, "skipped", "contrôleur injoignable")
        return
      }

      // 2. Flux SSE
      set("stream", fanRef.current.online ? "ok" : "fail", fanRef.current.online ? "mesures reçues chaque seconde" : "flux interrompu, reconnexion en cours")

      // 3. Température
      const temp = fanRef.current.status?.temp_c
      if (temp === undefined) set("temp", "fail", "aucune mesure reçue")
      else if (temp <= 0) set("temp", "fail", "0° : capteur illisible (DLL ASUS ou droits administrateur)")
      else if (temp > 110) set("temp", "warn", `${temp}° : valeur aberrante`)
      else set("temp", "ok", `${temp}°`)

      // 3 bis. Nombre de ventilateurs, tel que l'annonce la DLL ASUS : informatif — un seul est parfaitement normal.
      const fanCount = fanRef.current.status?.fan_count
      const rpm2 = fanRef.current.status?.fan2_rpm
      if (fanCount === undefined) {
        // Contrôleur ancien (sans fan_count) : on se rabat sur la seule mesure du second ventilateur.
        if (rpm2 === undefined) set("fan2", "skipped", "aucune rotation détectée sur un second ventilateur")
        else set("fan2", "ok", `second ventilateur détecté, ${rpm2} RPM`)
      } else if (fanCount < 0) set("fan2", "skipped", "la DLL ne précise pas le nombre de ventilateurs")
      else if (fanCount <= 1) set("fan2", "ok", `la DLL annonce ${fanCount} ventilateur`)
      else if (rpm2 !== undefined) set("fan2", "ok", `la DLL annonce ${fanCount} ventilateurs, le second tourne à ${rpm2} RPM`)
      else set("fan2", "warn", `la DLL annonce ${fanCount} ventilateurs, mais le second n'a pas encore été confirmé`)

      // 4. Service Windows
      if (!isTauri) set("service", "skipped", "disponible uniquement dans l'application installée")
      else {
        try {
          const state = await call<string>("service_status")
          if (state === "running") set("service", "ok", "installé et en cours d'exécution")
          else if (state === "stopped") set("service", "warn", "installé mais arrêté")
          else set("service", "ok", "non installé : le contrôleur est lancé par l'application")
        } catch (e) {
          set("service", "warn", typeof e === "string" ? e : (e as Error).message)
        }
      }

      // 5. Test actif
      if (withActiveTest) await runActiveTest(signal)
      else set("fan", "skipped", "test actif désactivé")
    } catch (e) {
      if (!(e instanceof Aborted)) throw e
      setChecks((cs) => cs.map((c) => (c.state === "running" || c.state === "pending" ? { ...c, state: "skipped", detail: "annulé" } : c)))
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(checks, fan))
      setCopied(true)
    } catch {
      /* presse-papiers refusé : l'utilisateur peut sélectionner la liste à la main */
    }
  }

  const finished = !running && checks.some((c) => c.state !== "pending")

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote
        summary={
          <>
          Le diagnostic vérifie que la chaîne complète fonctionne : le <b>contrôleur</b> répond, les <b>mesures</b> arrivent, la <b>température</b> est lisible et, si tu le souhaites, que le <b>ventilateur suit réellement une consigne</b>. À la fin, tu peux copier un rapport à joindre à une demande d'aide.
          </>
        }
      >
        Les trois premières vérifications sont passives et instantanées. Le <b>test actif</b> demande au ventilateur 30 % puis 80 % de puissance, attend à chaque fois que sa vitesse de rotation se stabilise (jusqu'à 12 secondes), compare les deux mesures, puis <b>restaure automatiquement</b> le mode d'origine, même si tu annules ou quittes la page. Il dure environ 25 secondes, et il est refusé si le processeur dépasse {ACTIVE_TEST_MAX_TEMP_C}° pour ne pas ralentir le refroidissement d'une machine déjà chaude. Les seuils de réussite (au moins {MIN_DELTA_OK_RPM} RPM d'écart entre 30 % et 80 %) sont indicatifs : un ventilateur très silencieux ou à faible plage peut afficher « Attention » sans être défectueux.
      </InfoNote>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="text-xs">Vérifications</CardTitle>
            <CardDescription>Lance le diagnostic puis lis le détail de chaque ligne.</CardDescription>
          </div>
          <div className="flex gap-1.5">
            {running ? (
              <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square /> Annuler
              </Button>
            ) : (
              <Button size="sm" onClick={run}>
                <Play /> Lancer
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={copy} disabled={!finished}>
              <ClipboardCopy /> {copied ? "Copié" : "Copier le rapport"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-none border p-3">
            <Label htmlFor="active-test" className="flex flex-col items-start gap-1">
              <span className="font-medium">Inclure le test actif du ventilateur</span>
              <span className="font-normal text-muted-foreground">Change temporairement la vitesse (30 % puis 80 %), puis la restaure.</span>
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
                    <div className="font-medium">{c.label}</div>
                    {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
                  </div>
                  <span className="shrink-0 text-muted-foreground">{STATE_LABEL[c.state]}</span>
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
