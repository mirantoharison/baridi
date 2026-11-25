import type { KeyboardEvent } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { isTauri } from "@/lib/tauri"
import { updatePrefs, usePrefs } from "@/lib/prefs"

/** Touche physique → nom d'accelerator Tauri. Les touches non listées sont refusées (Tab, Échap…). */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const named: Record<string, string> = { ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Space: "Space" }
  return named[code] ?? null
}

/** Construit « Ctrl+Alt+P » depuis un événement clavier ; null tant que la combinaison est incomplète. */
function toAccelerator(e: KeyboardEvent): string | null {
  const key = keyName(e.code)
  if (!key) return null
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean)
  // IMPORTANT : un raccourci GLOBAL sans modificateur volerait la touche à toutes les applications.
  if (mods.length === 0) return null
  return [...mods, key].join("+")
}

function ShortcutField({ id, label, value, disabled, onChange }: {
  id: string
  label: string
  value: string
  disabled: boolean
  onChange: (accelerator: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="font-normal">{label}</Label>
      <Input
        id={id}
        readOnly
        disabled={disabled}
        value={value}
        title={t("config.shortcuts.fieldHint")}
        className="w-44 text-center font-mono"
        onKeyDown={(e) => {
          // On laisse Tab passer pour ne pas piéger la navigation clavier.
          if (e.key === "Tab") return
          e.preventDefault()
          const accelerator = toAccelerator(e)
          if (accelerator) onChange(accelerator)
        }}
      />
    </div>
  )
}

/** Raccourcis clavier globaux. Préférences stockées côté interface (AppData). */
export function ShortcutsCard() {
  const { t } = useTranslation()
  const { shortcuts } = usePrefs()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">{t("config.shortcuts.title")}</CardTitle>
        <CardDescription>
          <Trans i18nKey="config.shortcuts.description" components={{ b: <b className="text-foreground" /> }} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isTauri && <p className="text-muted-foreground">{t("config.shortcuts.onlyInstalled")}</p>}

        <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="shortcuts-enabled" className="flex flex-col items-start gap-1">
              <span className="font-medium">{t("config.shortcuts.enable")}</span>
              <span className="font-normal text-muted-foreground">{t("config.shortcuts.enableHint")}</span>
            </Label>
            <Switch id="shortcuts-enabled" checked={shortcuts.enabled} onCheckedChange={(v) => updatePrefs("shortcuts", { enabled: v })} />
          </div>
          <ShortcutField
            id="shortcut-next"
            label={t("config.shortcuts.next")}
            value={shortcuts.nextProfile}
            disabled={!shortcuts.enabled}
            onChange={(a) => updatePrefs("shortcuts", { nextProfile: a })}
          />
          <ShortcutField
            id="shortcut-full"
            label={t("config.shortcuts.full")}
            value={shortcuts.toggleFull}
            disabled={!shortcuts.enabled}
            onChange={(a) => updatePrefs("shortcuts", { toggleFull: a })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
