import { useEffect, useRef, useState } from "react"
import { Gauge, Hand, Power, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModeSwitch, Readout, SpeedControl } from "@/components/fan-controls"
import { Choice } from "@/components/choice"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ProfileIcon } from "@/lib/profile-icons"
import type { FanMode, FanProfile } from "@/lib/api"
import { manualSpeedWarning, stopWarning } from "@/lib/guards"

const MODES: { id: FanMode; icon: typeof Sparkles }[] = [
  { id: "auto", icon: Sparkles },
  { id: "manual", icon: Hand },
  { id: "idle", icon: Power },
]

const PRESETS = [10, 25, 50, 75, 100]

interface Props {
  mode: FanMode
  percent: number
  /** Vitesse mesurée du ventilateur 1, en tours par minute (affichée pendant le réglage). */
  rpm?: number
  /** Température CPU courante : sert aux garde-fous (voir lib/guards.ts). Absente = aucune confirmation. */
  temp?: number
  onAuto: () => void
  onManual: (percent: number) => void
  onStop: () => void
  /** Profils proposés en mode Auto, profil actif et choix : la courbe du profil décide de la vitesse. */
  profiles: FanProfile[]
  activeProfileId?: string
  onSelectProfile: (id: string) => void
}

/** Action en attente de confirmation : `revert` remet l'affichage dans l'état réel si l'utilisateur annule. */
interface Pending {
  title: string
  message: string
  run: () => void
  revert?: () => void
}

/** Choix du mode ; le curseur manuel n'apparaît qu'en mode Manuel (envoi différé pour ne pas inonder le contrôleur). */
export function ControlCard({ mode, percent, temp, rpm, onAuto, onManual, onStop, profiles, activeProfileId, onSelectProfile }: Props) {
  const { t } = useTranslation()
  const [value, setValue] = useState(percent)
  const [pending, setPending] = useState<Pending | null>(null)
  const dragging = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Refs : le callback différé du curseur doit voir la température et la vitesse du moment, pas celles du rendu où il a été créé.
  const tempRef = useRef(temp)
  tempRef.current = temp
  const percentRef = useRef(percent)
  percentRef.current = percent

  // Suit la valeur réelle sauf pendant que l'utilisateur tire le curseur.
  useEffect(() => {
    if (!dragging.current) setValue(percent)
  }, [percent])

  /** Envoie une vitesse manuelle, ou demande confirmation si elle est trop basse pour la température. */
  const sendManual = (v: number) => {
    const warning = tempRef.current === undefined ? null : manualSpeedWarning(tempRef.current, v)
    if (!warning) return onManual(v)
    setPending({ title: t("control.guards.lowSpeedTitle"), message: warning, run: () => onManual(v), revert: () => setValue(percentRef.current) })
  }

  const commit = (v: number) => {
    setValue(v)
    dragging.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      sendManual(v)
      dragging.current = false
    }, 150)
  }

  const select = (id: FanMode) => {
    if (id === "auto") onAuto()
    else if (id === "idle") {
      const warning = temp === undefined ? null : stopWarning(temp)
      if (warning) setPending({ title: t("control.guards.stopTitle"), message: warning, run: onStop })
      else onStop()
    } else sendManual(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Gauge className="size-4 text-muted-foreground" /> {t("control.card.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Readout label={t("control.card.temp")} value={temp ?? "--"} unit="°C" />
          <Readout label={t("control.card.rpm")} value={rpm ?? "--"} unit="RPM" />
          <Readout label={t("control.card.setpoint")} value={percent} unit="%" />
        </div>

        <ModeSwitch modes={MODES.map((m) => ({ ...m, label: t(`control.card.modes.${m.id}`) }))} current={mode} onSelect={select} />

        {mode === "manual" && <SpeedControl value={value} presets={PRESETS} onChange={commit} />}
        {mode === "idle" && <p className="text-muted-foreground">{t("control.card.idleText")}</p>}
        {mode === "auto" && (
          <div className="space-y-3">
            <p className="text-muted-foreground">{t("control.card.autoText")}</p>
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{t("control.tab.activeProfile")}</span>
              <Choice
                className="w-64"
                value={activeProfileId ?? ""}
                options={profiles.map((p) => ({ value: p.id, label: p.source === "user" ? `${p.name} (${t("control.tab.custom")})` : p.name, icon: <ProfileIcon name={p.icon} /> }))}
                onChange={onSelectProfile}
              />
            </div>
          </div>
        )}
      </CardContent>

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          onConfirm={() => {
            pending.run()
            setPending(null)
          }}
          onCancel={() => {
            pending.revert?.()
            setPending(null)
          }}
        />
      )}
    </Card>
  )
}
