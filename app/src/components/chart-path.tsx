/**
 * Courbe de graphique au style des courbes de l'historique : trait uni de 2 px, sans remplissage. À placer dans un <svg>
 * étiré (viewBox + preserveAspectRatio="none") : `vectorEffect` garde l'épaisseur du trait constante malgré l'étirement.
 * `height` et `fillColor` ne servent plus (conservés pour ne pas changer les appelants) : voir l'historique des versions.
 */
export function ChartPath({ d, color, strokeWidth = 2 }: { d: string; height?: number; color: string; fillColor?: string; strokeWidth?: number }) {
  if (!d) return null
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
}
