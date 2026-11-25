import { useEffect, useState } from "react"
import { ClipboardCopy, FolderOpen } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type ControllerInfo } from "@/lib/api"
import { call, isTauri } from "@/lib/tauri"

/** La durée de fonctionnement affichée est relue à cette cadence : la précision à la minute suffit. */
const REFRESH_MS = 30_000

/** « 2 j 3 h 12 min » : les unités nulles de tête sont omises. */
function formatUptime(totalSeconds: number, t: TFunction): string {
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const parts = [days && t("about.info.uptimeD", { n: days }), (days || hours) && t("about.info.uptimeH", { n: hours }), t("about.info.uptimeM", { n: minutes })].filter(Boolean)
  return parts.join(" ")
}

function rowsOf(info: ControllerInfo, t: TFunction): [string, string][] {
  return [
    [t("about.info.version"), info.version],
    [t("about.info.run"), info.service ? t("about.info.service") : t("about.info.launched")],
    [t("about.info.fans"), info.fan_count === undefined ? t("about.info.unknown") : info.fan_count < 0 ? t("about.info.unspecified") : String(info.fan_count)],
    [t("about.info.pid"), String(info.pid)],
    [t("about.info.uptime"), formatUptime(info.uptime_s, t)],
    [t("about.info.dir"), info.dir],
    [t("about.info.settings"), info.settings_path],
    [t("about.info.profiles"), info.profiles_path],
  ]
}

/** Informations sur le contrôleur en cours d'exécution (version, mode, durée, fichiers) : utile pour dépanner ou demander de l'aide. */
export function AboutInfoCard() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<ControllerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let isMounted = true
    const load = () =>
      api
        .info()
        .then((i) => {
          if (!isMounted) return
          setInfo(i)
          setError(null)
        })
        .catch((e: Error) => {
          // Un contrôleur plus ancien n'a pas /info : on le dit plutôt que d'afficher une page vide.
          if (isMounted) setError(e.message)
        })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [])

  const copy = async () => {
    if (!info) return
    const text = rowsOf(info, t).map(([label, value]) => `${label} : ${value}`).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* presse-papiers refusé : les valeurs restent sélectionnables à la main */
    }
  }

  const openFolder = () => {
    call("open_config_dir").catch((e) => setError(typeof e === "string" ? e : (e as Error).message))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-xs">{t("about.info.title")}</CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={openFolder} disabled={!isTauri}>
            <FolderOpen /> {t("about.info.openFolder")}
          </Button>
          <Button size="sm" variant="ghost" onClick={copy} disabled={!info}>
            <ClipboardCopy /> {copied ? t("about.info.copied") : t("about.info.copy")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {info ? (
          <ul className="divide-y rounded-none border">
            {rowsOf(info, t).map(([label, value]) => (
              <li key={label} className="flex gap-4 p-3">
                <span className="w-40 shrink-0 font-medium">{label}</span>
                <span className="min-w-0 break-all font-mono text-muted-foreground">{value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {error ? t("about.info.unavailable", { error }) : t("about.info.reading")}
          </p>
        )}
        {!isTauri && <p className="mt-3 text-muted-foreground">{t("about.info.folderOnlyInstalled")}</p>}
      </CardContent>
    </Card>
  )
}
