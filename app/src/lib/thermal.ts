/** Couleur CSS (variable de thème) selon la température CPU. */
export function tempColor(temp: number): string {
  if (temp >= 80) return "var(--hot)"
  if (temp >= 65) return "var(--warm)"
  return "var(--cool)"
}

export function tempLabel(temp: number): string {
  if (temp >= 80) return "Critique"
  if (temp >= 65) return "Chaud"
  if (temp >= 50) return "Tiède"
  return "Frais"
}
