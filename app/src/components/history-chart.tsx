import type { Sample } from "@/hooks/use-fan"

const W = 600
const H = 120

function path(values: number[], max: number) {
  if (values.length < 2) return ""
  const step = W / (values.length - 1)
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(H - (Math.min(v, max) / max) * H).toFixed(1)}`)
    .join(" ")
}

/** Température et vitesse ventilateur sur les ~90 dernières secondes. */
export function HistoryChart({ history }: { history: Sample[] }) {
  const temps = history.map((s) => s.temp)
  const speeds = history.map((s) => s.percent)
  return (
    <div className="flex h-full min-h-36 flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 overflow-visible">
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1="0" x2={W} y1={H * r} y2={H * r} stroke="var(--border)" strokeDasharray="3 5" />
        ))}
        {/* Dégradé vertical aligné sur l'échelle 0–100° : la ligne change de couleur selon la température atteinte
            (bleu sous 55°, orange vers 65°, rouge dès 80°), comme la jauge. */}
        <defs>
          <linearGradient id="temp-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
            <stop offset="0.2" style={{ stopColor: "var(--hot)" }} />
            <stop offset="0.35" style={{ stopColor: "var(--warm)" }} />
            <stop offset="0.45" style={{ stopColor: "var(--cool)" }} />
          </linearGradient>
        </defs>
        <path d={path(speeds, 100)} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(temps, 100)} fill="none" stroke="url(#temp-gradient)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-0.5 w-4 bg-linear-to-r from-cool via-warm to-hot" /> Température
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-0.5 w-4 bg-primary" /> Vitesse
        </span>
      </div>
    </div>
  )
}
