import { Fan } from "lucide-react"

// Tours par seconde à 100 % de puissance. Volontairement bas : au-delà, l'animation
// donne l'impression de tourner à l'envers (effet stroboscopique à 60 fps).
const MAX_TURNS_PER_SECOND = 3

/** Icône de ventilateur dont la vitesse de rotation est proportionnelle à la puissance (0–100 %). */
export function FanRotor({ percent, className }: { percent: number; className?: string }) {
  const turnsPerSecond = (Math.min(Math.max(percent, 0), 100) / 100) * MAX_TURNS_PER_SECOND
  return (
    <Fan
      className={className}
      style={{
        animation: turnsPerSecond > 0 ? `spin-fan ${(1 / turnsPerSecond).toFixed(2)}s linear infinite` : "none",
      }}
    />
  )
}
