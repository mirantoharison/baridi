/**
 * Mini-courbe sans axes, au même style que les courbes de l'historique : trait uni de 2 px, sans remplissage.
 * `values` du plus ancien au plus récent ; `color` est n'importe quelle couleur CSS (variable de thème comprise).
 */
export function Sparkline({ values, color = "var(--primary)", width = 120, height = 24, className }: { values: number[]; color?: string; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />
  const min = Math.min(...values)
  const max = Math.max(...values)
  // IMPORTANT : une série plate donnerait une division par zéro ; on la trace au milieu plutôt qu'au bord.
  const isFlat = max === min
  const pad = 2
  const step = width / (values.length - 1)
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(isFlat ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - 2 * pad)).toFixed(1)}`)
    .join(" ")
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
