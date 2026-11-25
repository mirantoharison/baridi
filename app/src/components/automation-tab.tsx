import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AppWindow, ArrowDown, BatteryLow, ArrowUp, Battery, Check, Flame, Gauge, Leaf, Pencil, Plug, Plus, Rocket, Save, Scale, SlidersHorizontal, Trash2, TriangleAlert, X, Zap, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Choice } from "@/components/choice"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { ProfileIcon } from "@/lib/profile-icons"
import { usePolled } from "@/hooks/use-polled"
import { AppIcon, AppPicker } from "@/components/app-picker"
import { api, type AppEntry, type AutomationConfig, type AutomationRule, type AutomationState, type AutomationTrigger, type FanProfile } from "@/lib/api"

/** L'état observé (règle active, contexte) est relu à cette cadence : celle du moteur côté contrôleur. */
const STATE_REFRESH_MS = 5_000

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  process: "Un programme est lancé",
  power_source: "La source d'alimentation est",
  power_plan: "Le plan d'alimentation est",
  battery_below: "Le niveau de batterie est sous",
}
const TRIGGER_ICONS: Record<AutomationTrigger, LucideIcon> = { process: AppWindow, power_source: Plug, power_plan: Gauge, battery_below: BatteryLow }
const SOURCE_LABELS: Record<string, string> = { ac: "Le secteur", battery: "La batterie" }
const SOURCE_ICONS: Record<string, LucideIcon> = { ac: Plug, battery: Battery }
/** Un plan inconnu (renommé, ajouté par le constructeur) retombe sur « Personnalisé ». */
const PLAN_ICONS: Record<string, LucideIcon> = {
  "Équilibré": Scale,
  "Performances élevées": Rocket,
  "Performances maximales": Flame,
  "Économie d'énergie": Leaf,
  "Personnalisé": SlidersHorizontal,
}

/** Valeur par défaut d'un déclencheur quand on en change : une valeur d'un autre type serait refusée par le contrôleur. */
function defaultValue(trigger: AutomationTrigger, plans: string[]): string {
  if (trigger === "power_source") return "battery"
  if (trigger === "power_plan") return plans[0] ?? ""
  if (trigger === "battery_below") return "20"
  return ""
}

/** Classe commune des petits libellés « Quand » / « Alors » : largeur fixe pour aligner les deux lignes. */
const LABEL_CLASS = "w-12 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"

/** Vrai si la condition de la règle est remplie à cet instant, d'après ce que le contrôleur observe. */
function isConditionMet(rule: AutomationRule, state: AutomationState, apps: AppEntry[]): boolean {
  if (rule.trigger === "process") return apps.some((a) => a.name === rule.value.trim().toLowerCase() && a.running)
  if (rule.trigger === "power_source") return (rule.value === "battery") === state.on_battery
  if (rule.trigger === "battery_below") return state.on_battery && state.battery_percent < Number(rule.value)
  return rule.value !== "" && rule.value === state.power_plan
}

/** Ce qui empêche la règle de fonctionner, en une phrase (null = rien). Le contrôleur la refuserait de toute façon à l'enregistrement. */
function ruleProblem(rule: AutomationRule, profiles: FanProfile[]): string | null {
  if (rule.trigger === "process" && !rule.value.trim()) return "Choisis le programme à surveiller."
  if (rule.trigger === "battery_below" && !(Number(rule.value) >= 1 && Number(rule.value) <= 99)) return "Indique un niveau entre 1 et 99 %."
  if (!profiles.some((p) => p.id === rule.profile)) return "Le profil choisi n'existe plus : choisis-en un autre."
  return null
}

/** Icône Lucide à la taille des listes. */
const icon = (Icon: LucideIcon) => <Icon className="size-4 text-muted-foreground" />

/** Morceau de phrase mis en avant, précédé de son icône. */
function Part({ icon: leading, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      {leading}
      {children}
    </span>
  )
}

/** Phrase décrivant une règle enregistrée, avec les icônes de ses éléments : c'est ce que l'on lit tant qu'on ne la modifie pas. */
function RuleSentence({ rule, profiles }: { rule: AutomationRule; profiles: FanProfile[] }) {
  const profile = profiles.find((p) => p.id === rule.profile)
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>Quand</span>
      {rule.trigger === "process" && (
        <>
          <Part icon={<AppIcon name={rule.value} />}>
            <span className="font-mono">{rule.value || "un programme"}</span>
          </Part>
          <span>est lancé,</span>
        </>
      )}
      {rule.trigger === "power_source" && (
        <>
          <span>la machine est sur</span>
          <Part icon={icon(SOURCE_ICONS[rule.value] ?? Plug)}>{rule.value === "battery" ? "batterie" : "secteur"}</Part>
          <span className="-ml-1.5">,</span>
        </>
      )}
      {rule.trigger === "battery_below" && (
        <>
          <span>la batterie passe sous</span>
          <Part icon={icon(BatteryLow)}>{rule.value} %</Part>
          <span className="-ml-1.5">,</span>
        </>
      )}
      {rule.trigger === "power_plan" && (
        <>
          <span>le plan d'alimentation est</span>
          <Part icon={icon(PLAN_ICONS[rule.value] ?? SlidersHorizontal)}>{rule.value}</Part>
          <span className="-ml-1.5">,</span>
        </>
      )}
      <span>utiliser le profil</span>
      <Part icon={<ProfileIcon name={profile?.icon} className="size-4 text-muted-foreground" />}>{profile?.name ?? "profil supprimé"}</Part>
      {rule.plan && (
        <>
          <span>et le plan</span>
          <Part icon={icon(PLAN_ICONS[rule.plan] ?? SlidersHorizontal)}>{rule.plan}</Part>
        </>
      )}
      <span className="-ml-1.5">.</span>
    </p>
  )
}

/** Deux règles identiques champ à champ (sert à savoir si une modification attend d'être enregistrée). */
const sameRule = (a: AutomationRule, b: AutomationRule) =>
  a.name === b.name && a.enabled === b.enabled && a.trigger === b.trigger && a.value === b.value && a.profile === b.profile && (a.plan ?? "") === (b.plan ?? "")

function RuleRow({ rule, index, count, profiles, state, apps, isEditing, isNew, isDirty, onOpenPicker, onChange, onToggle, onMove, onEdit, onSave, onCancel, onDelete }: {
  /** Version affichée : le brouillon en cours de modification, sinon la règle enregistrée. */
  rule: AutomationRule
  index: number
  count: number
  profiles: FanProfile[]
  state: AutomationState
  apps: AppEntry[]
  isEditing: boolean
  /** Règle pas encore enregistrée : ni déplacement ni interrupteur tant qu'elle n'existe pas côté contrôleur. */
  isNew: boolean
  isDirty: boolean
  onOpenPicker: () => void
  onChange: (patch: Partial<AutomationRule>) => void
  onToggle: (enabled: boolean) => void
  onMove: (delta: -1 | 1) => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const isActive = rule.id === state.active_rule_id
  const isMet = isConditionMet(rule, state, apps)
  const problem = ruleProblem(rule, profiles)
  const profileOptions = profiles.map((p) => ({ value: p.id, label: p.name, icon: <ProfileIcon name={p.icon} className="size-4 text-muted-foreground" /> }))

  return (
    <div className={cn("rounded-none border", isActive && "border-primary/60 ring-1 ring-primary/30")}>
      <div className="flex items-center gap-3 p-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center bg-muted font-mono font-semibold text-muted-foreground"
          title={`Priorité ${index + 1} : les règles sont examinées de haut en bas`}
        >
          {index + 1}
        </span>
        {isEditing ? (
          <Input
            value={rule.name}
            placeholder="Nom de la règle"
            className="h-7 flex-1 font-medium"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        ) : (
          <span className={cn("flex-1 truncate font-medium", !rule.enabled && "text-muted-foreground")}>{rule.name || "Règle sans nom"}</span>
        )}
        {!isEditing && isActive && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-medium text-foreground">
            <Zap className="size-3" /> Appliquée
          </span>
        )}
        {!isEditing && !isActive && isMet && rule.enabled && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-muted-foreground ring-1 ring-border"
            title="La condition est vraie en ce moment, mais la règle n'est pas appliquée : l'automatisation est désactivée, ou une règle plus prioritaire s'applique."
          >
            <Check className="size-3" /> Condition remplie
          </span>
        )}
        {!isEditing && !isNew && <Switch checked={rule.enabled} onCheckedChange={onToggle} aria-label="Activer la règle" />}
        <div className="flex items-center">
          {!isEditing && !isNew && (
            <>
              <Button size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Monter (plus prioritaire)">
                <ArrowUp />
              </Button>
              <Button size="icon-sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Descendre">
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Modifier la règle" title="Modifier">
                <Pencil />
              </Button>
            </>
          )}
          {isEditing && (
            <>
              <Button size="icon-sm" variant="ghost" disabled={!!problem || !isDirty} onClick={onSave} aria-label="Enregistrer la règle" title="Enregistrer">
                <Save />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Annuler les modifications" title="Annuler">
                <X />
              </Button>
            </>
          )}
          <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label="Supprimer la règle" title="Supprimer">
            <Trash2 />
          </Button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2.5 border-t p-3">
          {/* Une seule ligne : chaque liste se partage la largeur et tronque son texte plutôt que de passer à la ligne. */}
          <div className="flex items-center gap-2">
            <span className={LABEL_CLASS}>Quand</span>
            <Choice
              className="min-w-0 flex-1"
              value={rule.trigger}
              options={(Object.keys(TRIGGER_LABELS) as AutomationTrigger[]).map((t) => ({ value: t, label: TRIGGER_LABELS[t], icon: icon(TRIGGER_ICONS[t]) }))}
              onChange={(t) => onChange({ trigger: t as AutomationTrigger, value: defaultValue(t as AutomationTrigger, state.plans) })}
            />
            {rule.trigger === "process" && (
              <AppPicker className="min-w-0 flex-1" value={rule.value} apps={apps} onOpen={onOpenPicker} onChange={(name) => onChange({ value: name })} />
            )}
            {rule.trigger === "power_source" && (
              <Choice
                className="min-w-0 flex-1"
                value={rule.value}
                options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label, icon: icon(SOURCE_ICONS[value]) }))}
                onChange={(v) => onChange({ value: v })}
              />
            )}
            {rule.trigger === "battery_below" && (
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={rule.value}
                  className="w-20 text-center font-mono"
                  onChange={(e) => onChange({ value: e.target.value })}
                />
                <span className="text-muted-foreground">%</span>
              </div>
            )}
            {rule.trigger === "power_plan" && (
              <Choice
                className="min-w-0 flex-1"
                value={rule.value}
                options={state.plans.map((p) => ({ value: p, label: p, icon: icon(PLAN_ICONS[p] ?? SlidersHorizontal) }))}
                onChange={(v) => onChange({ value: v })}
              />
            )}
            <span className={cn(LABEL_CLASS, "w-auto pl-1")}>Alors</span>
            <Choice className="min-w-0 flex-1" value={rule.profile} options={profileOptions} onChange={(v) => onChange({ profile: v })} />
          </div>
          <div className="flex items-center gap-2">
            <span className={LABEL_CLASS}>Et</span>
            <Choice
              className="w-64"
              value={rule.plan ?? ""}
              options={[
                { value: "", label: "Ne pas toucher au plan d'alimentation", icon: icon(Gauge) },
                ...state.plans.filter((p) => p !== "Personnalisé").map((p) => ({ value: p, label: `Plan ${p}`, icon: icon(PLAN_ICONS[p] ?? SlidersHorizontal) })),
              ]}
              onChange={(v) => onChange({ plan: v })}
            />
          </div>
          {problem && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <TriangleAlert className="size-3.5" /> {problem}
            </p>
          )}
        </div>
      ) : (
        // Règle enregistrée : une simple phrase, estompée quand la règle est désactivée.
        <div className={cn("border-t px-3 py-2 text-muted-foreground", !rule.enabled && "opacity-50")}>
          <RuleSentence rule={rule} profiles={profiles} />
        </div>
      )}
    </div>
  )
}

/** Automatisation : change de profil selon un programme lancé, la source d'alimentation ou le plan d'alimentation Windows. */
export function AutomationTab({ profiles }: { profiles: FanProfile[] }) {
  const polled = usePolled(api.automation, STATE_REFRESH_MS)
  // État du contrôleur : la relecture périodique, remplacée tout de suite par la réponse de chaque enregistrement.
  const [state, setState] = useState<AutomationState | null>(null)
  // Brouillons : règles en cours de modification (existantes ou nouvelles), par identifiant. Une règle sans brouillon
  // s'affiche comme texte. IMPORTANT : ils vivent hors de `state`, que la relecture écrase toutes les 5 secondes.
  const [drafts, setDrafts] = useState<Record<string, AutomationRule>>({})
  const [newIds, setNewIds] = useState<string[]>([])
  const [apps, setApps] = useState<AppEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (polled) setState(polled)
  }, [polled])

  // Programmes du système : lus dès que le contrôleur répond (au tout premier affichage il peut ne pas être prêt), puis
  // relus à chaque ouverture du sélecteur pour y voir les programmes lancés depuis.
  const loadApps = useCallback(() => {
    api.automationApps().then(setApps).catch(() => {})
  }, [])
  const isControllerUp = !!state
  useEffect(() => {
    if (isControllerUp) loadApps()
  }, [isControllerUp, loadApps])

  const rules = useMemo(() => {
    const saved = state?.rules ?? []
    const fresh = newIds.map((id) => drafts[id]).filter(Boolean)
    return [...saved, ...fresh]
  }, [state, newIds, drafts])

  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xs">Automatisation</CardTitle>
          <CardDescription>Lecture en cours… Si cela dure, le contrôleur est peut-être trop ancien pour cette fonction.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  /** Enregistre une configuration complète et adopte la réponse du contrôleur. */
  const commit = async (cfg: AutomationConfig): Promise<boolean> => {
    setError(null)
    try {
      setState(await api.saveAutomation(cfg))
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }
  const savedRules = state.rules
  const dropDraft = (id: string) => {
    setDrafts(({ [id]: _removed, ...rest }) => rest)
    setNewIds((ids) => ids.filter((i) => i !== id))
  }

  const add = () => {
    const id = crypto.randomUUID()
    const rule: AutomationRule = { id, name: `Règle ${rules.length + 1}`, enabled: true, trigger: "process", value: "", profile: profiles[0]?.id ?? "" }
    setDrafts((d) => ({ ...d, [id]: rule }))
    setNewIds((ids) => [...ids, id])
  }
  /** Enregistre UNE règle : seule elle change côté contrôleur, les brouillons des autres restent en cours. */
  const saveRule = async (id: string) => {
    const draft = drafts[id]
    if (!draft) return
    const exists = savedRules.some((r) => r.id === id)
    const next = exists ? savedRules.map((r) => (r.id === id ? draft : r)) : [...savedRules, draft]
    if (await commit({ enabled: state.enabled, rules: next })) dropDraft(id)
  }
  const removeRule = async (id: string) => {
    if (savedRules.some((r) => r.id === id)) {
      if (!(await commit({ enabled: state.enabled, rules: savedRules.filter((r) => r.id !== id) }))) return
    }
    dropDraft(id)
  }
  const toggleRule = (id: string, enabled: boolean) =>
    commit({ enabled: state.enabled, rules: savedRules.map((r) => (r.id === id ? { ...r, enabled } : r)) })
  const moveRule = (id: string, delta: -1 | 1) => {
    const i = savedRules.findIndex((r) => r.id === id)
    const next = [...savedRules]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    return commit({ enabled: state.enabled, rules: next })
  }

  const activeRule = savedRules.find((r) => r.id === state.active_rule_id)
  const baseName = profiles.find((p) => p.id === state.base_profile)?.name

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xs">Automatisation</CardTitle>
          <CardDescription>
            Change de profil tout seul selon le contexte. Les règles sont examinées dans l'ordre : la première qui correspond s'applique. Quand plus aucune ne correspond, le profil que tu utilisais avant revient, sauf si tu en as choisi un autre entre-temps. Le profil posé par une règle est temporaire : il n'est pas mémorisé pour le prochain démarrage. Le contrôleur évalue les règles toutes les 5 secondes, même interface fermée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-none border p-3">
            <Label htmlFor="auto-enabled" className="flex flex-col items-start gap-1">
              <span className="font-medium">Activer l'automatisation</span>
              <span className="font-normal text-muted-foreground">
                {activeRule
                  ? `Règle appliquée : ${activeRule.name}${baseName ? ` (retour à « ${baseName} » ensuite)` : ""}`
                  : "Aucune règle ne s'applique en ce moment."}
              </span>
            </Label>
            <Switch id="auto-enabled" checked={state.enabled} onCheckedChange={(v) => commit({ enabled: v, rules: savedRules })} />
          </div>
          <p className="text-muted-foreground">
            Vu par le contrôleur : {state.on_battery ? "sur batterie" : "sur secteur"}
            {state.power_plan && ` · plan « ${state.power_plan} »`}
          </p>
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-xs">Règles</CardTitle>
          <Button size="sm" variant="outline" onClick={add}>
            <Plus /> Ajouter une règle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 && <p className="text-muted-foreground">Aucune règle. Ajoute-en une, par exemple « un programme est lancé : jeu.exe → Turbo ».</p>}
          {rules.map((saved, i) => {
            const draft = drafts[saved.id]
            const isNew = newIds.includes(saved.id)
            const shown = draft ?? saved
            return (
              <RuleRow
                key={saved.id}
                rule={shown}
                index={i}
                count={savedRules.length}
                profiles={profiles}
                state={state}
                apps={apps}
                isEditing={!!draft}
                isNew={isNew}
                isDirty={isNew || (!!draft && !sameRule(draft, saved))}
                onOpenPicker={loadApps}
                onChange={(patch) => setDrafts((d) => ({ ...d, [saved.id]: { ...shown, ...patch } }))}
                onToggle={(enabled) => toggleRule(saved.id, enabled)}
                onMove={(delta) => moveRule(saved.id, delta)}
                onEdit={() => setDrafts((d) => ({ ...d, [saved.id]: saved }))}
                onSave={() => saveRule(saved.id)}
                onCancel={() => dropDraft(saved.id)}
                onDelete={() => removeRule(saved.id)}
              />
            )
          })}
          {error && <p className="text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
