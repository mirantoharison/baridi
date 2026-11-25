import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { CheckCircle2, Copy, Download, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isTauri } from "@/lib/tauri"

// Repli hors Tauri (navigateur de dev) : doit rester aligné sur package.json et tauri.conf.json.
const FALLBACK_VERSION = "2.0.0"
const REPO = "mirantoharison/baridi"
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`

interface Release {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string | null
  prerelease: boolean
}

type Check =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "done"; release: Release; isNewer: boolean }

/** « v2.1.0 » → [2, 1, 0]. Les parties non numériques (« -beta ») sont ignorées : on ne compare que le cœur de la version. */
function parseVersion(v: string): number[] {
  return v.replace(/^v/i, "").split(/[.\-+]/).slice(0, 3).map((p) => parseInt(p, 10) || 0)
}

/** Vrai si `candidate` est strictement plus récente que `current`. */
function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/**
 * Mises à jour : compare la version installée à la dernière release publiée sur GitHub. IMPORTANT : on ne fait que
 * vérifier et informer, rien n'est téléchargé ni installé. La requête n'envoie aucune donnée sur la machine, et elle ne
 * part que sur clic : pas de vérification en arrière-plan.
 */
export function UpdatesTab() {
  const [version, setVersion] = useState(FALLBACK_VERSION)
  const [check, setCheck] = useState<Check>({ kind: "idle" })
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    getVersion().then(setVersion).catch(() => {})
  }, [])

  const run = async () => {
    setCheck({ kind: "loading" })
    try {
      const res = await fetch(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" } })
      if (res.status === 404) {
        setCheck({ kind: "none" }) // dépôt sans release publiée
        return
      }
      if (!res.ok) throw new Error(res.status === 403 ? "GitHub limite les requêtes, réessaie dans quelques minutes." : `Réponse inattendue de GitHub (${res.status}).`)
      const release = (await res.json()) as Release
      setCheck({ kind: "done", release, isNewer: isNewerVersion(release.tag_name, version) })
    } catch (e) {
      const offline = e instanceof TypeError
      setCheck({ kind: "error", message: offline ? "Impossible de joindre GitHub : vérifie ta connexion." : (e as Error).message })
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    } catch {
      /* presse-papiers refusé : le lien reste affiché et sélectionnable */
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xs">Mises à jour</CardTitle>
          <CardDescription>
            Compare ta version à la dernière release publiée sur GitHub. La vérification ne part que quand tu cliques, et rien n'est installé automatiquement : si une version plus récente existe, tu la télécharges toi-même.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-none border p-3">
            <div>
              <div className="font-medium">Version installée</div>
              <div className="font-mono text-muted-foreground">{version}</div>
            </div>
            <Button variant="outline" disabled={check.kind === "loading"} onClick={run}>
              <RefreshCw className={check.kind === "loading" ? "animate-spin" : ""} />
              {check.kind === "loading" ? "Vérification…" : "Vérifier maintenant"}
            </Button>
          </div>

          {check.kind === "none" && <p className="text-muted-foreground">Aucune release n'est publiée pour le moment : tu as sûrement la dernière version.</p>}
          {check.kind === "error" && <p className="text-destructive">{check.message}</p>}
          {check.kind === "done" && !check.isNewer && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="size-4" /> Tu es à jour (dernière release : {check.release.tag_name}).
            </p>
          )}
        </CardContent>
      </Card>

      {check.kind === "done" && check.isNewer && (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs">
              <Download className="size-4 text-muted-foreground" /> Version {check.release.tag_name} disponible
            </CardTitle>
            {check.release.published_at && (
              <CardDescription>Publiée le {new Date(check.release.published_at).toLocaleDateString("fr-FR", { dateStyle: "long" })}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {check.release.body?.trim() ? (
              // Notes de version affichées en texte brut : jamais interprétées comme du HTML.
              <pre className="whitespace-pre-wrap rounded-none border p-3 font-sans text-muted-foreground">{check.release.body.trim()}</pre>
            ) : (
              <p className="text-muted-foreground">Cette release n'a pas de notes de version.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <a href={check.release.html_url} target="_blank" rel="noreferrer" className="text-foreground underline-offset-4 hover:underline">
                {check.release.html_url}
              </a>
              <Button size="sm" variant="outline" onClick={() => copy(check.release.html_url)}>
                <Copy /> {isCopied ? "Copié" : "Copier le lien"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
