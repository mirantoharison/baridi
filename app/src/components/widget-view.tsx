import { ChartPath } from "@/components/chart-path"
import { useEffect, useState } from "react"
import { emit, listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { BatteryCharging, BatteryFull, Cpu, MemoryStick, MonitorCog, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useFan, type Sample } from "@/hooks/use-fan"
import type { FanStatus } from "@/lib/api"
import { DEFAULT_PREFS, usePrefs } from "@/lib/prefs"
import { call, isTauri } from "@/lib/tauri"
import { tempColor } from "@/lib/thermal"

/** Événement émis quand l'utilisateur ferme le widget avec sa croix : la fenêtre principale met alors son réglage à jour. */
export const WIDGET_CLOSED_EVENT = "widget-closed"
/** Événement envoyé par la fenêtre principale quand un réglage du widget change (opacité). */
export const WIDGET_SETTINGS_EVENT = "widget-settings"
/** Clé du localStorage (commun aux deux fenêtres) où le widget garde sa dernière position. */
export const WIDGET_POSITION_KEY = "fancontroller:widget-position"

/** Opacité au repos : celle des préférences au chargement, puis celle que la fenêtre principale envoie quand on la change. */
function useIdleOpacity(): number {
  const { widget } = usePrefs()
  const [override, setOverride] = useState<number | null>(null)
  useEffect(() => {
    if (!isTauri) return
    const unlisten = listen<{ opacity: number }>(WIDGET_SETTINGS_EVENT, (e) => setOverride(e.payload.opacity))
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])
  return override ?? widget.opacity ?? DEFAULT_PREFS.widget.opacity
}

/** Mémorise la position du widget à chaque déplacement, pour le retrouver au même endroit au prochain lancement. */
function useRememberPosition() {
  useEffect(() => {
    if (!isTauri) return
    const unlisten = getCurrentWindow().onMoved(({ payload }) => {
      try {
        localStorage.setItem(WIDGET_POSITION_KEY, JSON.stringify({ x: payload.x, y: payload.y }))
      } catch {
        /* stockage indisponible : le widget reviendra à son emplacement par défaut */
      }
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])
}

/** Échelles du graphique : la température sur 30–100 °C, les deux ventilateurs sur 0–6000 RPM (même axe vertical, légende à part). */
const TEMP_MIN = 30
const TEMP_MAX = 100
const RPM_MAX = 6000
const CHART_W = 300
const CHART_H = 64

/**
 * Le thème (clair/sombre) est un choix de la fenêtre principale, mémorisé dans le localStorage commun aux deux fenêtres.
 * IMPORTANT : le widget lit ce choix au chargement (script d'index.html) ET le suit en direct (événement « storage »).
 */
function useFollowTheme() {
  // La fenêtre du widget est transparente (voir tauri.conf.json) : sans cela, le fond de la page, opaque, masquerait
  // l'effet de transparence du widget lui-même.
  useEffect(() => {
    document.documentElement.style.background = "transparent"
    document.body.style.background = "transparent"
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme") document.documentElement.classList.toggle("dark", e.newValue === "dark")
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
}

/** Tracé d'une série : les relevés absents (ventilateur 2 inexistant) coupent la ligne au lieu de la tirer vers zéro. */
function linePath(samples: Sample[], pick: (s: Sample) => number | undefined, toY: (v: number) => number): string {
  const step = CHART_W / Math.max(samples.length - 1, 1)
  let d = ""
  samples.forEach((s, i) => {
    const v = pick(s)
    if (v === undefined || v <= 0) return
    d += `${d ? "L" : "M"} ${(i * step).toFixed(1)} ${toY(v).toFixed(1)} `
  })
  return d
}

/** Une entrée de légende : pastille de couleur, libellé court et valeur actuelle. */
function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="inline-block h-0.5 w-3" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </span>
  )
}

/** Courbe en temps réel (90 dernières secondes) de la température et des vitesses des deux ventilateurs. */
function LiveChart({ history, status }: { history: Sample[]; status: FanStatus | null }) {
  const { t } = useTranslation()
  const toTempY = (v: number) => CHART_H - ((Math.min(Math.max(v, TEMP_MIN), TEMP_MAX) - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * CHART_H
  const toRpmY = (v: number) => CHART_H - (Math.min(v, RPM_MAX) / RPM_MAX) * CHART_H
  const hasFan2 = status?.fan2_rpm !== undefined
  const tempColorNow = status?.temp_c ? tempColor(status.temp_c) : "var(--muted-foreground)"
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pr-5 text-[10px]">
        <Legend color={tempColorNow} label="°C" value={status?.temp_c ? String(status.temp_c) : "--"} />
        <Legend color="var(--primary)" label={hasFan2 ? t("info.fan.title1") : t("info.fan.title")} value={status ? `${status.rpm}` : "--"} />
        {hasFan2 && <Legend color="#c0775a" label={t("info.fan.title2")} value={`${status?.fan2_rpm}`} />}
      </div>
      <div className="relative min-h-0 flex-1 border bg-muted/20">
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={r} x1="0" x2={CHART_W} y1={CHART_H * r} y2={CHART_H * r} stroke="var(--border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          ))}
          <ChartPath d={linePath(history, (s) => s.rpm, toRpmY)} height={CHART_H} color="var(--primary)" />
          {hasFan2 && <ChartPath d={linePath(history, (s) => s.rpm2, toRpmY)} height={CHART_H} color="#c0775a" />}
          <ChartPath d={linePath(history, (s) => s.temp, toTempY)} height={CHART_H} color={tempColorNow} />
        </svg>
      </div>
    </div>
  )
}

/** Carte compacte : icône et libellé, valeur principale en grand, détail en petit. Quatre tiennent sur une ligne. */
function Card({ icon: Icon, label, value, detail }: { icon: typeof Cpu; label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-px border bg-muted/30 px-1.5 py-1">
      <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <Icon className="size-2.5 shrink-0" /> <span className="truncate">{label}</span>
      </span>
      <span className="truncate font-mono text-sm leading-tight font-semibold tabular-nums">{value}</span>
      <span className="h-3 truncate font-mono text-[9px] leading-3 text-muted-foreground tabular-nums">{detail ?? ""}</span>
    </div>
  )
}

/**
 * Mini-widget toujours visible : courbe en temps réel de la température et des deux ventilateurs, quatre cartes sur une
 * ligne (CPU, GPU, mémoire, batterie) et le profil actif. C'est une seconde fenêtre de la même application (voir
 * tauri.conf.json), avec son propre flux de mesures ; elle suit le thème et la langue de la fenêtre principale. On la
 * déplace en la saisissant n'importe où (data-tauri-drag-region) et on la ferme avec la croix.
 */
export function WidgetView() {
  const { t } = useTranslation()
  useFollowTheme()
  useRememberPosition()
  const idleOpacity = useIdleOpacity()
  const { status, history, online } = useFan()
  const s = online ? status : null

  const close = async () => {
    await call("set_widget_visible", { visible: false }).catch(() => {})
    await emit(WIDGET_CLOSED_EVENT).catch(() => {})
  }

  const battery = s?.battery
  const BatteryIcon = battery?.charging ? BatteryCharging : BatteryFull
  const gpu = s?.gpu
  const watts = s?.battery_details?.has_power && Math.abs(s.battery_details.power_w) >= 0.1 ? `${Math.abs(s.battery_details.power_w).toFixed(0)} W` : undefined

  return (
    <div
      data-tauri-drag-region
      // Semi-transparent tant que la souris n'est pas dessus : le widget reste visible sans cacher ce qu'il y a derrière (jeu,
      // document). Il redevient net au survol, pour lire les valeurs.
      style={{ "--idle-opacity": idleOpacity / 100 } as React.CSSProperties}
      className="relative flex h-full select-none flex-col gap-1.5 overflow-hidden border bg-card p-2 text-xs text-card-foreground [opacity:var(--idle-opacity)] transition-opacity duration-200 hover:opacity-100"
    >
      <button
        type="button"
        onClick={close}
        aria-label={t("widget.close")}
        className="absolute top-1.5 right-1.5 z-10 flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>

      <div data-tauri-drag-region className="pointer-events-none flex min-h-0 flex-1 flex-col">
        <LiveChart history={history} status={s} />
      </div>

      <div data-tauri-drag-region className="pointer-events-none flex gap-1.5">
        <Card
          icon={Cpu}
          label="CPU"
          value={s?.cpu ? `${Math.round(s.cpu.usage_percent)}%` : "--"}
          detail={s?.cpu ? `${(s.cpu.freq_mhz / 1000).toFixed(2)} GHz` : undefined}
        />
        <Card
          icon={MonitorCog}
          label="GPU"
          value={!gpu ? "--" : gpu.asleep ? t("widget.gpuAsleep") : `${gpu.temp_c}°`}
          detail={gpu && !gpu.asleep ? `${gpu.usage_percent}%${gpu.power_w > 0 ? ` · ${Math.round(gpu.power_w)}W` : ""}` : undefined}
        />
        <Card
          icon={MemoryStick}
          label="RAM"
          value={s?.ram ? `${Math.round(s.ram.usage_percent)}%` : "--"}
          detail={s?.ram ? `${(s.ram.used_mb / 1024).toFixed(1)} ${t("hardware.units.gb")}` : undefined}
        />
        <Card
          icon={BatteryIcon}
          label={t("hardware.battery.level")}
          value={battery ? `${battery.percent}%` : "--"}
          detail={battery ? [battery.plugged_in ? "⚡" : "", watts].filter(Boolean).join(" ") || undefined : undefined}
        />
      </div>

      <div data-tauri-drag-region className="pointer-events-none flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">
          {t("common.statusBar.profile")} <span className="text-foreground">{s?.profile ?? "--"}</span>
        </span>
        <span className="rounded-full px-1.5 py-px ring-1 ring-border">{s?.mode ?? "--"}</span>
      </div>
    </div>
  )
}
