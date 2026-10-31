import { useState } from "react"
import { Plus, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import type { CurveMode } from "@/lib/curve-path"
import { CurveEditor } from "@/components/curve-editor"
import { PROFILE_ICONS, ProfileIcon } from "@/lib/profile-icons"
import type { CurvePoint, FanProfile } from "@/lib/api"
import { cn } from "@/lib/utils"

const DEFAULT_POINTS: CurvePoint[] = [
  { temp: 50, speed: 20 },
  { temp: 70, speed: 50 },
  { temp: 100, speed: 100 },
]

interface Props {
  profiles: FanProfile[]
  curveMode?: CurveMode
  /** Profil à modifier ; absent = création. */
  initial?: FanProfile
  /** Profil à dupliquer : préremplit le formulaire en création. */
  base?: FanProfile
  onSave: (p: FanProfile) => Promise<void>
  onCancel: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

export function ProfileForm({ profiles, curveMode, initial, base, onSave, onCancel }: Props) {
  const seed = initial ?? base
  const [name, setName] = useState(initial?.name ?? (base ? `${base.name} (copie)` : ""))
  const [description, setDescription] = useState(seed?.description ?? "")
  const [icon, setIcon] = useState(seed?.icon ?? "Gauge")
  const [points, setPoints] = useState<CurvePoint[]>(seed ? seed.points.map((p) => ({ ...p })) : DEFAULT_POINTS)

  const setPoint = (i: number, patch: Partial<CurvePoint>) =>
    setPoints((pts) => pts.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const addPoint = () =>
    setPoints((pts) => {
      const last = pts[pts.length - 1]
      return [...pts, { temp: clamp((last?.temp ?? 40) + 10, 0, 100), speed: last?.speed ?? 50 }]
    })

  const valid = name.trim().length > 0 && points.length > 0

  const submit = () =>
    onSave({
      id: initial?.id ?? `custom_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      icon,
      // Le contrôleur lit la courbe dans l'ordre : on la trie ici aussi pour l'aperçu.
      points: [...points].sort((a, b) => a.temp - b.temp),
      source: "user",
    })

  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs">{initial ? `Modifier « ${initial.name} »` : "Nouveau profil"}</CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X /> Annuler
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            <Save /> {initial ? "Enregistrer" : "Créer le profil"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Nom</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Gaming" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Icône</Label>
          <div className="flex flex-wrap gap-1.5">
            {PROFILE_ICONS.map(({ name: n, label }) => (
              <button
                key={n}
                type="button"
                title={label}
                onClick={() => setIcon(n)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md border transition-colors hover:bg-accent",
                  icon === n && "border-primary bg-accent",
                )}
              >
                <ProfileIcon name={n} />
              </button>
            ))}
          </div>
        </div>

        {!initial && !base && profiles.length > 0 && (
          <div className="space-y-1.5">
            <Label>Partir d'un profil existant</Label>
            <Select
              onValueChange={(id) => {
                const base = profiles.find((p) => p.id === id)
                if (base) setPoints(base.points.map((p) => ({ ...p })))
              }}
            >
              <SelectTrigger className="w-56">
                <span className="text-muted-foreground">Copier la courbe de…</span>
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <ProfileIcon name={p.icon} /> {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Courbe</Label>
            <Button size="sm" variant="outline" onClick={addPoint}>
              <Plus /> Palier
            </Button>
          </div>
          <CurveEditor points={points} editable onChange={setPoints} mode={curveMode} />
          <p className="text-muted-foreground">
            Chaque ligne du tableau est un point de la courbe : la première colonne indique la température en degrés et la seconde la vitesse du ventilateur en pourcentage. Selon le mode choisi dans les réglages, un point fixe la vitesse tant que la température reste sous sa valeur (Steep) ou sert de repère entre lesquels la vitesse est interpolée (Smooth) ; dans les deux cas, la vitesse du dernier point s'applique au-delà de sa température. Tu peux glisser les points verticalement sur le graphique pour régler leur vitesse, par pas de 5 %, saisir directement les valeurs dans le tableau pour plus de précision, ajouter un point avec le bouton « Palier » ou en retirer un avec la croix (il en faut au moins un). Les points sont triés par température à l'enregistrement et les vitesses sont limitées entre 0 et 100 %. Pense à garder une courbe qui monte avec la température : une courbe qui redescendrait à chaud ralentirait le ventilateur au pire moment. Le nom est obligatoire, la description et l'icône servent seulement à reconnaître le profil dans les listes.
          </p>
          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <span className="text-muted-foreground">Jusqu'à (°C)</span>
            <span className="text-muted-foreground">Vitesse (%)</span>
            <span />
            {points.map((p, i) => (
              <div key={i} className="contents">
                <Input
                  type="number"
                  value={p.temp}
                  min={0}
                  max={100}
                  onChange={(e) => setPoint(i, { temp: clamp(e.target.valueAsNumber, 0, 100) })}
                />
                <Input
                  type="number"
                  value={p.speed}
                  min={0}
                  max={100}
                  onChange={(e) => setPoint(i, { speed: clamp(e.target.valueAsNumber, 0, 100) })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={points.length <= 1}
                  onClick={() => setPoints((pts) => pts.filter((_, j) => j !== i))}
                  aria-label="Supprimer le palier"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
