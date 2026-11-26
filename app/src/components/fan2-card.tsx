import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Cpu, Hand, Spline, Wind } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModeSwitch, Readout, SpeedControl } from "@/components/fan-controls"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ZoneEditor } from "@/components/zone-editor"
import { Choice } from "@/components/choice"
import { FAN2_MIN_MANUAL_PERCENT, type CurvePoint, type Fan2Curve, type Fan2Mode, type Fan2Source, type FanStatus } from "@/lib/api"
import { fan2CurveTarget, fan2SourceTemp } from "@/lib/fan2"
import { manualSpeedWarning } from "@/lib/guards"

const MODES: { id: Fan2Mode; icon: typeof Wind }[] = [
  { id: "firmware", icon: Cpu },
  { id: "follow", icon: Wind },
  { id: "manual", icon: Hand },
  { id: "curve", icon: Spline },
]

/** Courbe proposée la première fois : douce au repos, pleine vitesse avant la zone dangereuse. */
const DEFAULT_FAN2_POINTS: CurvePoint[] = [
  { temp: 40, speed: 25 },
  { temp: 55, speed: 40 },
  { temp: 70, speed: 70 },
  { temp: 85, speed: 100 },
]

/** Vitesse minimale du dernier palier : même valeur que fan2CurveMinTopSpeed côté Go (sinon la courbe est refusée). */
const FAN2_CURVE_MIN_TOP_SPEED = 60

const SOURCES: Fan2Source[] = ["cpu", "gpu", "max"]

/** Délai avant d'envoyer la valeur du curseur : évite d'inonder le contrôleur pendant que l'on glisse. */
const SEND_DELAY_MS = 250

interface Props {
  status: FanStatus
  onFan2: (mode: Fan2Mode, percent?: number) => void
  onFan2Curve: (curve: Fan2Curve) => void
}

/**
 * Commande du second ventilateur (celui que la DLL annonce en plus du premier). Affichée seulement si le contrôleur
 * en détecte deux. Le mode « Firmware » est le comportement d'origine ; quitter l'application ou le contrôleur
 * rend toujours le ventilateur au firmware.
 */
export function Fan2Card({ status, onFan2, onFan2Curve }: Props) {
  const { t } = useTranslation()
  const mode = status.fan2_mode ?? "firmware"
  // Brouillon de la courbe : modifié librement, appliqué seulement par le bouton (chaque envoi réécrit le matériel).
  const [draftPoints, setDraftPoints] = useState<CurvePoint[]>(status.fan2_curve?.points ?? DEFAULT_FAN2_POINTS)
  const [draftSource, setDraftSource] = useState<Fan2Source>(status.fan2_curve?.source ?? "max")
  const applied = status.fan2_curve
  // Le brouillon repart de la courbe appliquée quand elle change (après un « Appliquer », ou depuis un autre endroit).
  // IMPORTANT : la dépendance est le CONTENU de la courbe, pas l'objet (le flux en renvoie un neuf chaque seconde) : sinon les
  // modifications en cours seraient écrasées à chaque mesure.
  const appliedKey = applied ? JSON.stringify(applied) : ""
  useEffect(() => {
    if (applied) {
      setDraftPoints(applied.points)
      setDraftSource(applied.source)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appliedKey résume `applied`
  }, [appliedKey])
  // « Appliquer » n'est actif que s'il y a quelque chose à enregistrer : la courbe affichée diffère de celle appliquée.
  const isDirty =
    !applied ||
    applied.source !== draftSource ||
    applied.points.length !== draftPoints.length ||
    applied.points.some((p, i) => p.temp !== draftPoints[i].temp || p.speed !== draftPoints[i].speed)
  const [value, setValue] = useState(status.fan2_percent || 50)
  const [pending, setPending] = useState<{ title: string; message: string; confirmLabel?: string; run: () => void } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const tempRef = useRef(status.temp_c)
  tempRef.current = status.temp_c

  // Suit la consigne réellement appliquée (changement fait ailleurs, ou repli automatique par sécurité).
  useEffect(() => {
    if (status.fan2_percent) setValue(status.fan2_percent)
  }, [status.fan2_percent])

  useEffect(() => () => clearTimeout(timer.current), [])

  /** Envoie une vitesse manuelle, avec confirmation si elle est trop basse pour la température (mêmes règles que le ventilateur 1). */
  const sendManual = (percent: number) => {
    const warning = manualSpeedWarning(tempRef.current, percent)
    if (!warning) return onFan2("manual", percent)
    setPending({ title: t("control.guards.lowSpeedTitle"), message: warning, run: () => onFan2("manual", percent) })
  }

  /** Revenir au BIOS après un autre mode libère aussi le ventilateur 1 : on demande confirmation (voir DESCRIPTIONS.firmware). */
  const goBios = () => {
    if (mode === "firmware") return
    setPending({
      title: t("control.fan2.biosConfirmTitle"),
      message: t("control.fan2.biosConfirmMessage"),
      confirmLabel: t("control.fan2.biosConfirmLabel"),
      run: () => onFan2("firmware"),
    })
  }

  const commit = (percent: number) => {
    setValue(percent)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => sendManual(percent), SEND_DELAY_MS)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <Wind className="size-4 text-muted-foreground" /> {t("control.fan2.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Readout label={t("control.fan2.rpm")} value={status.fan2_rpm ?? "--"} unit="RPM" />
          <Readout label={t("control.fan2.requested")} value={mode === "manual" ? `${status.fan2_percent ?? value}%` : mode === "follow" ? `${status.percent}%` : mode === "curve" ? `${fan2CurveTarget(status) ?? "—"}%` : "—"} />
        </div>

        <ModeSwitch
          modes={MODES.map((m) => ({ ...m, label: t(`control.fan2.modes.${m.id}`) }))}
          current={mode}
          onSelect={(id) => {
            if (id === "manual") sendManual(value)
            else if (id === "firmware") goBios()
            // Un clic applique tout de suite la dernière courbe enregistrée ; la toute première fois, la courbe proposée.
            else if (id === "curve") applied ? onFan2("curve") : onFan2Curve({ points: draftPoints, source: draftSource })
            else onFan2(id)
          }}
        />

        {mode === "manual" && <SpeedControl value={value} min={FAN2_MIN_MANUAL_PERCENT} presets={[50, 75, 100]} onChange={commit} />}

        {mode === "curve" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t("control.fan2.basedOn")}</span>
              <Choice
                className="w-64"
                value={draftSource}
                options={SOURCES.map((value) => ({ value, label: t(`control.fan2.sources.${value}`) }))}
                onChange={(v) => setDraftSource(v as Fan2Source)}
              />
            </div>
            <ZoneEditor points={draftPoints} temp={fan2SourceTemp(status, draftSource)} onChange={setDraftPoints} increasing minTopSpeed={FAN2_CURVE_MIN_TOP_SPEED} />
            <Button size="sm" disabled={!isDirty} onClick={() => onFan2Curve({ points: draftPoints, source: draftSource })}>
              {t("control.fan2.applyCurve")}
            </Button>
          </div>
        )}

        {/* Visible seulement quand le BIOS pilote réellement les deux ventilateurs (et pas à chaque démarrage). */}
        {status.bios_override && (
          <div role="alert" className="flex items-start gap-2 border border-amber-500/50 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <Trans i18nKey="control.fan2.biosOverride" components={{ b: <b /> }} />
            </span>
          </div>
        )}

        <p className="text-muted-foreground">{t(`control.fan2.descriptions.${mode}`)}</p>
      </CardContent>

      {pending && (
        <ConfirmDialog
          title={pending.title}
          confirmLabel={pending.confirmLabel}
          message={pending.message}
          onConfirm={() => {
            pending.run()
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </Card>
  )
}
