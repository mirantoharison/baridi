import { useEffect, useState } from "react"
import { ClipboardCopy, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type ControllerInfo } from "@/lib/api"
import { call, isTauri } from "@/lib/tauri"

/** La durée de fonctionnement affichée est relue à cette cadence : la précision à la minute suffit. */
const REFRESH_MS = 30_000

/** « 2 j 3 h 12 min » : les unités nulles de tête sont omises. */
function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const parts = [days && `${days} j`, (days || hours) && `${hours} h`, `${minutes} min`].filter(Boolean)
  return parts.join(" ")
}

function rowsOf(info: ControllerInfo): [string, string][] {
  return [
    ["Version du contrôleur", info.version],
    ["Exécution", info.service ? "Service Windows" : "Lancé par l'application"],
    ["Ventilateurs (selon la DLL)", info.fan_count === undefined ? "inconnu" : info.fan_count < 0 ? "non précisé par la DLL" : String(info.fan_count)],
    ["Identifiant du processus", String(info.pid)],
    ["En marche depuis", formatUptime(info.uptime_s)],
    ["Dossier", info.dir],
    ["Réglages", info.settings_path],
    ["Profils", info.profiles_path],
  ]
}

/** Informations sur le contrôleur en cours d'exécution (version, mode, durée, fichiers) : utile pour dépanner ou demander de l'aide. */
export function AboutInfoCard() {
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
    const text = rowsOf(info).map(([label, value]) => `${label} : ${value}`).join("\n")
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
        <CardTitle className="text-xs">Informations techniques</CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={openFolder} disabled={!isTauri}>
            <FolderOpen /> Ouvrir le dossier
          </Button>
          <Button size="sm" variant="ghost" onClick={copy} disabled={!info}>
            <ClipboardCopy /> {copied ? "Copié" : "Copier"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {info ? (
          <ul className="divide-y rounded-none border">
            {rowsOf(info).map(([label, value]) => (
              <li key={label} className="flex gap-4 p-3">
                <span className="w-40 shrink-0 font-medium">{label}</span>
                <span className="min-w-0 break-all font-mono text-muted-foreground">{value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {error ? `Informations indisponibles : ${error}. Le contrôleur ne répond pas, ou il est d'une version antérieure à cette fonction.` : "Lecture en cours…"}
          </p>
        )}
        {!isTauri && <p className="mt-3 text-muted-foreground">L'ouverture du dossier n'est disponible que dans l'application installée.</p>}
      </CardContent>
    </Card>
  )
}
