import { Cpu, Flame, Gauge, Leaf, Moon, Rocket, Snowflake, Thermometer, Wind, Zap, type LucideIcon } from "lucide-react"

/** Icônes proposées pour un profil — la valeur stockée côté Go est le `name`. */
export const PROFILE_ICONS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: "Flame", label: "Flamme", icon: Flame },
  { name: "Snowflake", label: "Froid", icon: Snowflake },
  { name: "Zap", label: "Éclair", icon: Zap },
  { name: "Wind", label: "Vent", icon: Wind },
  { name: "Gauge", label: "Jauge", icon: Gauge },
  { name: "Thermometer", label: "Thermomètre", icon: Thermometer },
  { name: "Moon", label: "Silencieux", icon: Moon },
  { name: "Cpu", label: "CPU", icon: Cpu },
  { name: "Leaf", label: "Éco", icon: Leaf },
  { name: "Rocket", label: "Turbo", icon: Rocket },
]

export function ProfileIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = PROFILE_ICONS.find((i) => i.name === name)?.icon ?? Gauge
  return <Icon className={className ?? "size-4"} />
}
