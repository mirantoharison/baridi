import { useState } from "react"
import { ChevronDown, Copy, FileText, LifeBuoy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { saveTextFile, today } from "@/lib/files"
import type { Fan } from "@/lib/nav"
import { usePrefs } from "@/lib/prefs"
import { requestLog } from "@/lib/request-log"
import { cn } from "@/lib/utils"

/** Sujets de l'aide : clés de `help.topics.<id>.title` et `.body`. */
const TOPICS = ["curve", "hysteresis", "curveMode", "fan2", "bios", "tempSource", "throttle", "power", "gpuSleep", "history", "automation", "widget"] as const
const CHANGELOG = ["v2"] as const
/** Nombre de lignes du journal jointes au rapport d'assistance. */
const LOG_LINES = 40

/** Sujet repliable : le titre seul tant qu'on ne l'ouvre pas. */
function Topic({ id, isOpen, onToggle }: { id: string; isOpen: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="border-b last:border-b-0">
      <button type="button" className="flex w-full items-center justify-between gap-3 py-2 text-left" aria-expanded={isOpen} onClick={onToggle}>
        <span className="font-semibold">{t(`help.topics.${id}.title`)}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="space-y-2 pb-3 leading-relaxed text-muted-foreground">
          {t(`help.topics.${id}.body`).split("\n\n").map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Centre d'aide : explication des notions, raccourcis, nouveautés et rapport d'assistance à joindre à un signalement. */
export function HelpTab({ fan }: { fan: Fan }) {
  const { t } = useTranslation()
  const prefs = usePrefs()
  // Un seul sujet ouvert à la fois : en ouvrir un autre referme le précédent.
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shortcuts: [string, string][] = [
    [t("help.shortcuts.speed10"), prefs.shortcuts.speed10],
    [t("help.shortcuts.speed25"), prefs.shortcuts.speed25],
    [t("help.shortcuts.speed50"), prefs.shortcuts.speed50],
    [t("help.shortcuts.speed75"), prefs.shortcuts.speed75],
    [t("help.shortcuts.nextProfile"), prefs.shortcuts.nextProfile],
    [t("help.shortcuts.toggleFull"), prefs.shortcuts.toggleFull],
    [t("help.shortcuts.toggleWidget"), prefs.shortcuts.toggleWidget],
    [t("help.shortcuts.toggleClickThrough"), prefs.shortcuts.toggleClickThrough],
  ]

  /**
   * Rapport à joindre à une demande d'aide : version, machine, état, réglages et dernières lignes du journal.
   * IMPORTANT : ne contient jamais la clé de l'API (ni aucune valeur secrète) ; les lignes du journal ne portent que des
   * chemins et des codes de réponse.
   */
  const buildReport = async (): Promise<string> => {
    const [info, system] = await Promise.all([api.info().catch(() => null), api.system().catch(() => null)])
    const s = fan.status
    const logs = requestLog
      .snapshot()
      .slice(-LOG_LINES)
      .map((e) => `${new Date(e.t).toISOString()} ${e.method} ${e.path} ${e.status}${e.error ? ` ${e.error}` : ""}`)
    return [
      "Baridi - Fancontroller — rapport d'assistance",
      `Date : ${new Date().toISOString()}`,
      `Contrôleur : ${info ? `${info.version} (${info.service ? "service" : "application"}, ${info.fan_count ?? "?"} ventilateur(s))` : "injoignable"}`,
      system ? `Machine : ${system.manufacturer} ${system.model}, BIOS ${system.bios_version} (${system.bios_date}), plan ${system.power_plan}` : "",
      s ? `Mode : ${s.mode}, profil ${s.profile}, courbe ${s.curve_mode}, source ${s.temp_source ?? "cpu"}, hystérésis ${s.hysteresis_c ?? "?"} °C` : "État : indisponible",
      s ? `Mesures : ${s.temp_c} °C, ${s.rpm} RPM${s.fan2_rpm !== undefined ? ` / ${s.fan2_rpm} RPM` : ""}, consigne ${s.percent} %, mode BIOS ${s.bios_override ? "oui" : "non"}` : "",
      s?.gpu ? `Carte graphique : ${s.gpu.name}, ${s.gpu.asleep ? "endormie" : `${s.gpu.temp_c} °C`}, pilote ${s.gpu.driver ?? "?"}` : "Carte graphique : aucune",
      `Alertes : ${prefs.alerts.enabled ? "oui" : "non"}, raccourcis : ${prefs.shortcuts.enabled ? "oui" : "non"}, widget : ${prefs.widget.enabled ? "oui" : "non"}`,
      "",
      `Dernières lignes du journal (${logs.length}) :`,
      ...logs,
    ]
      .filter((l) => l !== "")
      .join("\n")
  }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(await buildReport())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  const save = () => run(async () => setSavedPath((await saveTextFile(`baridi-assistance-${today()}.txt`, await buildReport())).path))

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <LifeBuoy className="size-4 text-muted-foreground" /> {t("help.topicsTitle")}
          </CardTitle>
          <CardDescription>{t("help.topicsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {TOPICS.map((id) => (
            <Topic key={id} id={id} isOpen={openTopic === id} onToggle={() => setOpenTopic((cur) => (cur === id ? null : id))} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs">{t("help.shortcutsTitle")}</CardTitle>
          <CardDescription>{prefs.shortcuts.enabled ? t("help.shortcutsOn") : t("help.shortcutsOff")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {shortcuts.map(([label, keys]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="border bg-muted/40 px-1.5 py-0.5 font-mono">{keys}</kbd>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs">{t("help.changelogTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANGELOG.map((v) => (
            <div key={v}>
              <div className="font-semibold">{t(`help.changelog.${v}.title`)}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {(t(`help.changelog.${v}.items`, { returnObjects: true }) as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <FileText className="size-4 text-muted-foreground" /> {t("help.supportTitle")}
          </CardTitle>
          <CardDescription>{t("help.supportHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copy}>
              <Copy /> {copied ? t("help.copied") : t("help.copyReport")}
            </Button>
            <Button variant="outline" onClick={save}>
              <FileText /> {t("help.saveReport")}
            </Button>
          </div>
          {savedPath && <p className="break-all text-muted-foreground">{t("backup.saved", { path: savedPath })}</p>}
          {error && <p className="text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
