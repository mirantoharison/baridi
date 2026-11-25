import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Cpu, Hand, Spline, Wind } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { CurveEditor } from "@/components/curve-editor"
import { Choice } from "@/components/choice"
import { FAN2_MIN_MANUAL_PERCENT, type CurvePoint, type Fan2Curve, type Fan2Mode, type Fan2Source, type FanStatus } from "@/lib/api"
import { manualSpeedWarning } from "@/lib/guards"
import { cn } from "@/lib/utils"

const MODES: { id: Fan2Mode; label: string; icon: typeof Wind }[] = [
  { id: "firmware", label: "BIOS", icon: Cpu },
  { id: "follow", label: "Suivre le 1", icon: Wind },
  { id: "manual", label: "Manuel", icon: Hand },
  { id: "curve", label: "Courbe", icon: Spline },
]

/** Courbe proposée la première fois : douce au repos, pleine vitesse avant la zone dangereuse. */
const DEFAULT_FAN2_POINTS: CurvePoint[] = [
  { temp: 40, speed: 25 },
  { temp: 55, speed: 40 },
  { temp: 70, speed: 70 },
  { temp: 85, speed: 100 },
]

const SOURCE_OPTIONS: { value: Fan2Source; label: string }[] = [
  { value: "cpu", label: "Température du processeur" },
  { value: "gpu", label: "Température de la carte graphique" },
  { value: "max", label: "La plus haute des deux" },
]

const DESCRIPTIONS: Record<Fan2Mode, string> = {
  firmware:
    "Le BIOS de la carte mère pilote ce ventilateur. Au démarrage, c'est le mode par défaut et il n'a aucun effet sur le ventilateur 1. Mais y revenir après « Suivre le 1 » ou « Manuel » coupe le mode test de la DLL, ce qui rend AUSSI le ventilateur 1 au BIOS : la courbe de ton profil est alors ignorée tant que ce mode reste actif. Le BIOS garde la machine au frais, mais il ne suit plus tes réglages.",
  follow:
    "Ce ventilateur reçoit la même consigne que le ventilateur 1 : il suit donc la courbe du profil actif, y compris le lissage et l'hystérésis. La consigne est réécrite par paliers d'environ 4 % pour ne pas ralentir la montée en vitesse.",
  manual:
    "Tu fixes toi-même la vitesse de ce ventilateur. Elle est maintenue quelle que soit la température du processeur, sauf au-delà de 85° où il repasse tout seul en mode « Suivre le 1 ». Ce choix n'est jamais mémorisé : au prochain lancement, il redevient piloté par le firmware.",
  curve:
    "Ce ventilateur a sa propre courbe, indépendante du profil, calée sur la température de ton choix. Sur ce portable c'est celui de la carte graphique : le caler sur la GPU le fait accélérer quand un jeu la sollicite, même si le processeur reste frais. La température de la carte n'est lue que si elle est déjà allumée : l'application ne la réveille jamais, et se rabat sur celle du processeur quand elle dort. Au-delà de 85° (processeur), il repasse en « Suivre le 1 ». Cette courbe est mémorisée.",
}

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
  const mode = status.fan2_mode ?? "firmware"
  // Brouillon de la courbe : modifié librement, appliqué seulement par le bouton (chaque envoi réécrit le matériel).
  const [draftPoints, setDraftPoints] = useState<CurvePoint[]>(status.fan2_curve?.points ?? DEFAULT_FAN2_POINTS)
  const [draftSource, setDraftSource] = useState<Fan2Source>(status.fan2_curve?.source ?? "max")
  const [isCurveOpen, setIsCurveOpen] = useState(false)
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
    setPending({ title: "Vitesse manuelle faible", message: warning, run: () => onFan2("manual", percent) })
  }

  /** Revenir au BIOS après un autre mode libère aussi le ventilateur 1 : on demande confirmation (voir DESCRIPTIONS.firmware). */
  const goBios = () => {
    if (mode === "firmware") return
    setPending({
      title: "Passer en mode BIOS ?",
      message:
        "Le BIOS va piloter les deux ventilateurs, y compris le ventilateur 1 : la courbe de ton profil sera ignorée tant que tu restes dans ce mode. Pour la retrouver, choisis « Suivre le 1 » ou « Manuel ».",
      confirmLabel: "Passer en BIOS",
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
          <Wind className="size-4 text-muted-foreground" /> Ventilateur 2
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-1 rounded-none bg-muted p-1">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                if (id === "manual") sendManual(value)
                else if (id === "firmware") goBios()
                // Sans courbe enregistrée, on ouvre l'éditeur au lieu d'activer un mode vide.
                else if (id === "curve") (status.fan2_curve ? onFan2("curve") : setIsCurveOpen(true))
                else onFan2(id)
              }}
              aria-pressed={mode === id}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-none py-2 text-xs font-medium transition-colors",
                mode === id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === "manual" && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Vitesse manuelle</span>
              <span className="font-mono text-base font-semibold tabular-nums">{value}%</span>
            </div>
            <Slider value={[value]} min={FAN2_MIN_MANUAL_PERCENT} max={100} step={5} onValueChange={(v) => commit(Array.isArray(v) ? v[0] : v)} />
            <div className="grid grid-cols-3 gap-2">
              {[50, 75, 100].map((p) => (
                <Button key={p} size="sm" variant="outline" onClick={() => commit(p)}>
                  {p}%
                </Button>
              ))}
            </div>
          </div>
        )}

        {(mode === "curve" || isCurveOpen) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Calée sur</span>
              <Choice
                className="w-64"
                value={draftSource}
                options={SOURCE_OPTIONS.map((o) => ({ ...o, icon: null }))}
                onChange={(v) => setDraftSource(v as Fan2Source)}
              />
            </div>
            <CurveEditor
              points={draftPoints}
              temp={status.temp_c}
              mode="smooth"
              editable
              className="h-56"
              onChange={setDraftPoints}
            />
            <Button
              size="sm"
              onClick={() => {
                onFan2Curve({ points: draftPoints, source: draftSource })
                setIsCurveOpen(false)
              }}
            >
              Appliquer la courbe
            </Button>
          </div>
        )}

        {/* Visible seulement quand le BIOS pilote réellement les deux ventilateurs (et pas à chaque démarrage). */}
        {status.bios_override && (
          <div role="alert" className="flex items-start gap-2 border border-amber-500/50 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Le BIOS pilote actuellement les <b>deux</b> ventilateurs : la courbe de ton profil est ignorée, même si la page Pilotage affiche « Auto ». Choisis « Suivre le 1 » ou « Manuel » pour la retrouver.
            </span>
          </div>
        )}

        <p className="text-muted-foreground">{DESCRIPTIONS[isCurveOpen ? "curve" : mode]}</p>
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
