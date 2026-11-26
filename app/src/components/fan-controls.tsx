import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

const STEP = 5

/** Sélecteur de mode à boutons segmentés, communs aux deux ventilateurs. `onSelect` reçoit l'identifiant cliqué. */
export function ModeSwitch<T extends string>({ modes, current, onSelect }: { modes: { id: T; label: string; icon: ComponentType<{ className?: string }> }[]; current: T; onSelect: (id: T) => void }) {
  return (
    <div className="grid gap-1 rounded-none bg-muted p-1" style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }} role="group">
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={current === id}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-none py-2 text-xs font-medium transition-colors",
            current === id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

/** Mesure en direct : libellé, grande valeur et unité. Sert à voir l'effet d'un réglage pendant qu'on le fait. */
export function Readout({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-base font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  )
}

/**
 * Réglage d'une vitesse en pourcentage : grande valeur, curseur (pas de 5) et raccourcis.
 * `onChange` est appelé à chaque modification ; l'appelant décide quand envoyer (délai, confirmation).
 */
export function SpeedControl({ value, min = 0, presets, onChange }: { value: number; min?: number; presets: number[]; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(100, Math.max(min, v))
  return (
    <div className="space-y-3">
      <div className="text-center font-mono text-3xl font-semibold tabular-nums">{value}%</div>
      <Slider value={[value]} min={min} max={100} step={STEP} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}>
        {presets.map((p) => (
          <Button key={p} size="sm" variant={value === p ? "default" : "outline"} onClick={() => onChange(clamp(p))}>
            {p}%
          </Button>
        ))}
      </div>
    </div>
  )
}
