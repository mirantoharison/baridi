import type { KeyboardEvent } from "react"
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
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="font-normal">{label}</Label>
      <Input
        id={id}
        readOnly
        disabled={disabled}
        value={value}
        title="Clique puis appuie sur la combinaison voulue (avec Ctrl, Alt, Shift ou Win)"
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
  const { shortcuts } = usePrefs()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Raccourcis clavier globaux</CardTitle>
        <CardDescription>
          Les raccourcis fonctionnent depuis <b className="text-foreground">n'importe quelle application</b> tant que l'interface est ouverte, fenêtre réduite dans la zone de notification incluse. Une combinaison doit contenir au moins un modificateur (Ctrl, Alt, Shift ou Win), sans quoi elle volerait la touche à toutes les autres applications. Si une combinaison est déjà prise par un autre programme, elle ne sera simplement pas enregistrée : l'autre raccourci reste actif. Ces préférences sont enregistrées dans un fichier de l'interface, indépendant du contrôleur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isTauri && <p className="text-muted-foreground">Les raccourcis globaux ne fonctionnent que dans l'application installée.</p>}

        <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="shortcuts-enabled" className="flex flex-col items-start gap-1">
              <span className="font-medium">Activer les raccourcis</span>
              <span className="font-normal text-muted-foreground">Clique dans un champ puis appuie sur la combinaison voulue.</span>
            </Label>
            <Switch id="shortcuts-enabled" checked={shortcuts.enabled} onCheckedChange={(v) => updatePrefs("shortcuts", { enabled: v })} />
          </div>
          <ShortcutField
            id="shortcut-next"
            label="Profil suivant"
            value={shortcuts.nextProfile}
            disabled={!shortcuts.enabled}
            onChange={(a) => updatePrefs("shortcuts", { nextProfile: a })}
          />
          <ShortcutField
            id="shortcut-full"
            label="Plein régime (100 % ↔ Auto)"
            value={shortcuts.toggleFull}
            disabled={!shortcuts.enabled}
            onChange={(a) => updatePrefs("shortcuts", { toggleFull: a })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
