import { useRef, useState } from "react"
import { DatabaseBackup, FolderOpen, Upload } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { applyBackup, BackupError, buildBackup, parseBackup, type ApplyResult, type Backup } from "@/lib/backup"
import { readFileText, revealFile, saveTextFile, today } from "@/lib/files"
import type { Fan } from "@/lib/nav"
import { usePrefs } from "@/lib/prefs"
import { isTauri } from "@/lib/tauri"

/** Sauvegarde et restauration de tous les réglages (interface et contrôleur) dans un seul fichier. */
export function BackupTab({ fan }: { fan: Fan }) {
  const { t, i18n } = useTranslation()
  const prefs = usePrefs()
  const inputRef = useRef<HTMLInputElement>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const exportAll = async () => {
    setError(null)
    setIsBusy(true)
    try {
      const backup = await buildBackup(fan.status, fan.profiles, prefs)
      const saved = await saveTextFile(`baridi-sauvegarde-${today()}.json`, JSON.stringify(backup, null, 2))
      setSavedPath(saved.path)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  const choose = async (file: File | undefined) => {
    setError(null)
    setResult(null)
    setPending(null)
    if (!file) return
    try {
      setPending(parseBackup(await readFileText(file)))
    } catch (e) {
      setError(e instanceof BackupError ? t(`backup.errors.${e.code}`) : (e as Error).message)
    }
  }

  const restore = async () => {
    if (!pending) return
    setIsBusy(true)
    try {
      setResult(await applyBackup(pending, fan))
      setPending(null)
    } finally {
      setIsBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <DatabaseBackup className="size-4 text-muted-foreground" /> {t("backup.exportTitle")}
          </CardTitle>
          <CardDescription>{t("backup.exportDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isBusy} onClick={exportAll}>
              <DatabaseBackup /> {t("backup.exportButton")}
            </Button>
            {savedPath && isTauri && (
              <Button variant="outline" onClick={() => revealFile(savedPath).catch(() => {})}>
                <FolderOpen /> {t("backup.reveal")}
              </Button>
            )}
          </div>
          {savedPath && <p className="break-all text-muted-foreground">{t("backup.saved", { path: savedPath })}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <Upload className="size-4 text-muted-foreground" /> {t("backup.importTitle")}
          </CardTitle>
          <CardDescription>{t("backup.importDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          <Button variant="outline" disabled={isBusy} onClick={() => inputRef.current?.click()}>
            <Upload /> {t("backup.chooseFile")}
          </Button>

          {error && <p className="text-destructive">{error}</p>}

          {pending && (
            <div className="space-y-2 rounded-none border p-3">
              <p>
                {t("backup.summary", {
                  date: new Date(pending.exported_at).toLocaleString(i18n.language),
                  profiles: pending.controller.custom_profiles?.length ?? 0,
                  rules: pending.controller.automation?.rules?.length ?? 0,
                })}
              </p>
              <p className="text-muted-foreground">{t("backup.warning")}</p>
              <Button disabled={isBusy} onClick={restore}>
                {t("backup.restore")}
              </Button>
            </div>
          )}

          {result && (
            <div className="space-y-1 rounded-none border p-3">
              <p>{t("backup.done", { profiles: result.profiles, rules: result.rules })}</p>
              {result.errors.length > 0 && (
                <ul className="list-disc pl-5 text-destructive">
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
