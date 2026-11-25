import type { ReactNode } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

/** Une option : son identifiant, son libellé et, si on veut, une icône (élément déjà prêt). */
export interface ChoiceOption {
  value: string
  label: string
  icon?: ReactNode
}

/** Liste déroulante à valeurs textuelles : elle affiche le libellé (et l'icône) de l'option choisie, pas son identifiant. */
export function Choice({ value, options, onChange, className }: {
  value: string
  options: ChoiceOption[]
  onChange: (v: string) => void
  className?: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <Select value={value} onValueChange={(v) => v !== null && v !== undefined && onChange(v)}>
      <SelectTrigger className={className}>
        {current ? (
          <span className="flex items-center gap-2">
            {current.icon} {current.label}
          </span>
        ) : (
          <span className="text-muted-foreground">Choisir</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-2">
              {o.icon} {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
