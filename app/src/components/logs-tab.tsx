import { useState } from "react"
import { ChevronRight, ClipboardCopy, Trash2 } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InfoNote } from "@/components/info-note"
import { BASE_URL } from "@/lib/api"
import { MAX_LOG_LINES, requestLog, useRequestLog, type LogEntry } from "@/lib/request-log"
import { cn } from "@/lib/utils"

/** JSON indenté pour la lecture ; un texte qui n'est pas du JSON (réponse tronquée, erreur brute) est renvoyé tel quel. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** Commande curl équivalente à une requête consignée, à coller dans un terminal pour la rejouer. Null pour une ligne SSE. */
function toCurl(e: LogEntry): string | null {
  if (e.method === "SSE") return null
  // IMPORTANT : la vraie clé n'est jamais recopiée dans la commande (elle finirait dans le presse-papiers et l'historique du
  // terminal) : un repère à remplacer par le contenu du fichier api.key du contrôleur.
  const parts = ["curl", "-X", e.method, "-H", `"Authorization: Bearer <contenu de api.key>"`]
  if (e.body) parts.push("-H", `"Content-Type: application/json"`, "-d", `'${e.body.replace(/'/g, "'\\''")}'`)
  parts.push(`"${BASE_URL}${e.path}"`)
  return parts.join(" ")
}

/**
 * Bloc de texte monospace à hauteur bornée : une longue réponse défile dans son cadre sans étirer la ligne.
 *
 * IMPORTANT : le défilement passe par ScrollArea comme partout dans l'application. Son viewport est `size-full` : la
 * hauteur maximale doit donc se poser sur le VIEWPORT (sélecteur ci-dessous), pas sur la racine — sur une racine à hauteur
 * automatique, le viewport grandirait avec son contenu et ne défilerait jamais. Une réponse courte garde sa hauteur naturelle.
 */
function CodeBlock({ text }: { text: string }) {
  return (
    <ScrollArea className="rounded-md bg-background/60 ring-1 ring-border [&_[data-slot=scroll-area-viewport]]:max-h-40">
      <pre className="whitespace-pre-wrap break-all p-2 text-[11px] leading-relaxed text-foreground/90">{text}</pre>
    </ScrollArea>
  )
}

/** Détails d'une requête consignée : ce qui a été envoyé, ce qui est revenu, et de quoi copier l'un ou l'autre. */
function LogDetails({ entry }: { entry: LogEntry }) {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState<string | null>(null)
  const curl = toCurl(entry)
  const response = entry.response ? prettyJson(entry.response) : null

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch {
      /* presse-papiers refusé : le texte reste sélectionnable dans le cadre */
    }
  }

  const label = "mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"

  return (
    <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2.5 text-xs">
      <div>
        <div className={label}>{t("logs.request")}</div>
        <div className="break-all font-semibold">
          {entry.method} <span className="font-normal text-muted-foreground">{BASE_URL}</span>
          {entry.path}
        </div>
        {entry.body && (
          <div className="mt-1.5">
            <CodeBlock text={prettyJson(entry.body)} />
          </div>
        )}
      </div>

      <div>
        <div className={label}>{t("logs.response")}</div>
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>
            {t("logs.code")} <b className="font-semibold text-foreground">{String(entry.status)}</b>
          </span>
          {entry.ms !== undefined && (
            <span>
              {t("logs.duration")} <b className="font-semibold text-foreground">{entry.ms} ms</b>
            </span>
          )}
          <span>
            {t("logs.time")} <b className="font-semibold text-foreground">{new Date(entry.t).toLocaleString(i18n.language)}</b>
          </span>
        </div>
        {entry.error && <div className="mb-1.5 text-rose-600 dark:text-rose-400">{entry.error}</div>}
        {response ? (
          <CodeBlock text={response} />
        ) : (
          <div className="text-muted-foreground">
            {entry.method === "SSE" ? t("logs.sseNoContent") : t("logs.noContent")}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {curl && (
          <Button size="sm" variant="outline" onClick={() => copy("curl", curl)}>
            <ClipboardCopy /> {copied === "curl" ? t("logs.copied") : t("logs.copyCurl")}
          </Button>
        )}
        {response && (
          <Button size="sm" variant="outline" onClick={() => copy("response", response)}>
            <ClipboardCopy /> {copied === "response" ? t("logs.copied") : t("logs.copyResponse")}
          </Button>
        )}
      </div>
    </div>
  )
}

const time = (ts: number, locale: string) => {
  const d = new Date(ts)
  return d.toLocaleTimeString(locale, { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0")
}

/** Issue d'une ligne : « ok » (accepté ou flux ouvert), « error » (refusé, injoignable ou flux perdu). */
function outcome(status: LogEntry["status"]): "ok" | "error" {
  if (status === "OPEN" || status === "REG" || status === "KEY") return "ok"
  if (status === "LOST" || status === "ERR") return "error"
  return status < 400 ? "ok" : "error"
}

/**
 * Issue d'une ligne. IMPORTANT : aucun fond coloré sur les lignes ni sur le code de réponse — un code accepté
 * reste neutre (c'est le cas normal, il n'a pas à attirer l'œil) ; seule une erreur prend une teinte, en texte et
 * en point, sans aplat de couleur.
 */
const OUTCOME_STYLE = {
  ok: {
    row: "border-l-transparent hover:bg-foreground/[0.04]",
    badge: "bg-muted/60 text-muted-foreground ring-border",
    dot: "bg-muted-foreground/60",
  },
  error: {
    row: "border-l-transparent hover:bg-foreground/[0.04]",
    badge: "bg-muted/60 text-rose-600 ring-rose-500/30 dark:text-rose-400",
    dot: "bg-rose-500",
  },
} as const

/**
 * Palette « Ardoise » : la pastille est grise et neutre, et seul un point de couleur distingue la méthode. Le point
 * reste vif sur le fond sombre sans qu'aucun aplat de couleur n'attire l'œil sur la ligne.
 */
function methodDotClass(method: string) {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-sky-400"
    case "POST":
      return "bg-indigo-400"
    case "PUT":
      return "bg-amber-400"
    case "PATCH":
      return "bg-violet-400"
    case "DELETE":
      return "bg-rose-400"
    case "SSE":
      return "bg-fuchsia-400"
    default:
      return "bg-muted-foreground"
  }
}

/** Durée : neutre tant que le contrôleur répond vite (sous 100 ms, le cas normal), orange sous 500 ms, rose au-delà. */
function durationClass(ms: number | undefined) {
  if (ms === undefined || ms < 100) return "text-muted-foreground"
  if (ms < 500) return "text-amber-600 dark:text-amber-400"
  return "text-rose-600 dark:text-rose-400"
}

/** Chemin lisible : les segments de tête en teinte douce, le dernier (la ressource) en pleine intensité. */
function PathText({ path }: { path: string }) {
  const cut = path.lastIndexOf("/")
  return (
    <>
      <span className="text-sky-600/70 dark:text-sky-300/60">{path.slice(0, cut + 1)}</span>
      <span className="font-semibold text-foreground">{path.slice(cut + 1)}</span>
    </>
  )
}

/** Journal des requêtes envoyées au contrôleur (les plus récentes en haut). */
export function LogsTab() {
  const { t, i18n } = useTranslation()
  const entries = useRequestLog()
  const rows = [...entries].reverse()
  // Une seule ligne dépliée à la fois : l'id d'une entrée est stable, la ligne reste ouverte quand de nouvelles arrivent.
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <div className="flex h-full flex-col gap-4">
      <InfoNote summary={<Trans i18nKey="logs.summary" components={{ b: <b /> }} />}>
        <Trans i18nKey="logs.details" values={{ max: MAX_LOG_LINES }} components={{ b: <b /> }} />
      </InfoNote>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xs">
            {t("logs.title")}
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-mono font-semibold tabular-nums text-sky-600 ring-1 ring-sky-500/40 dark:text-sky-300">
              {entries.length}/{MAX_LOG_LINES}
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
            onClick={() => requestLog.clear()}
            disabled={entries.length === 0}
          >
            <Trash2 /> {t("logs.clear")}
          </Button>
        </CardHeader>
        <CardContent className="relative min-h-0 flex-1">
          {rows.length === 0 ? (
            <p className="m-auto py-8 text-center text-muted-foreground">{t("logs.empty")}</p>
          ) : (
            <div className="absolute inset-x-4 inset-y-0">
              <ScrollArea className="h-full">
                <ul className="pr-3 font-mono">
                  {rows.map((e) => {
                    const style = OUTCOME_STYLE[outcome(e.status)]
                    const open = openId === e.id
                    return (
                      <li key={e.id} className={cn("mb-1 rounded-md border border-transparent transition-colors", open ? "border-border bg-foreground/[0.03]" : style.row)}>
                        <button
                          type="button"
                          aria-expanded={open}
                          title={open ? t("logs.hideDetails") : t("logs.showDetails")}
                          onClick={() => setOpenId(open ? null : e.id)}
                          className="flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                        <span className="shrink-0 tabular-nums text-violet-600/80 dark:text-violet-300/70">{time(e.t, i18n.language)}</span>
                        <span className="w-[4.25rem] shrink-0">
                          <span className="inline-flex w-16 items-center justify-center gap-1.5 rounded-md bg-muted py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground/80 ring-1 ring-border">
                            <span className={cn("size-1.5 rounded-full", methodDotClass(e.method))} />
                            {e.method}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1 break-all">
                          <PathText path={e.path} />
                          {e.body && <span className="text-amber-600/90 dark:text-amber-300/80"> {e.body}</span>}
                          {e.error && <span className="text-rose-600 dark:text-rose-400"> — {e.error}</span>}
                        </span>
                        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ring-1", style.badge)}>
                          <span className={cn("size-1.5 rounded-full", style.dot, e.status === "OPEN" && "animate-pulse")} />
                          {e.status}
                        </span>
                        <span className={cn("w-14 shrink-0 text-right tabular-nums font-medium", durationClass(e.ms))}>
                          {e.ms !== undefined ? `${e.ms} ms` : ""}
                        </span>
                          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                        </button>
                        {open && <LogDetails entry={e} />}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
