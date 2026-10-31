import { tempColor, tempLabel } from "@/lib/thermal"

const R = 78
const START = 135 // degrés — arc de 270° ouvert vers le bas
const SWEEP = 270
const MAX_TEMP = 100

function polar(angle: number) {
  const a = (angle * Math.PI) / 180
  return { x: 100 + R * Math.cos(a), y: 100 + R * Math.sin(a) }
}

function arc(from: number, to: number) {
  const s = polar(from)
  const e = polar(to)
  const large = to - from > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`
}

/** Jauge circulaire de température CPU, colorée par seuil. */
export function TempGauge({ temp }: { temp: number }) {
  const ratio = Math.min(Math.max(temp / MAX_TEMP, 0), 1)
  const color = tempColor(temp)
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[220px]">
      <svg viewBox="0 0 200 200" className="size-full">
        <path d={arc(START, START + SWEEP)} fill="none" stroke="var(--muted)" strokeWidth="12" strokeLinecap="round" />
        {ratio > 0 && (
          <path
            d={arc(START, START + SWEEP * ratio)}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            style={{ transition: "stroke 0.4s" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-3xl font-semibold tabular-nums" style={{ color }}>
          {temp}
          <span className="ml-0.5 align-top text-xs text-muted-foreground">°C</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{tempLabel(temp)}</div>
      </div>
    </div>
  )
}
