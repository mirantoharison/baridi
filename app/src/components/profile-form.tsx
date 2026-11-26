import { useState } from "react"
import { Plus, Save, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { ZoneEditor } from "@/components/zone-editor"
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
  /** Profil à modifier ; absent = création. */
  initial?: FanProfile
  /** Profil à dupliquer : préremplit le formulaire en création. */
  base?: FanProfile
  onSave: (p: FanProfile) => Promise<void>
  onCancel: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

export function ProfileForm({ profiles, initial, base, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const seed = initial ?? base
  const [name, setName] = useState(initial?.name ?? (base ? `${base.name} ${t("profiles.copySuffix")}` : ""))
  const [description, setDescription] = useState(seed?.description ?? "")
  const [icon, setIcon] = useState(seed?.icon ?? "Gauge")
  const [points, setPoints] = useState<CurvePoint[]>(seed ? seed.points.map((p) => ({ ...p })) : DEFAULT_POINTS)

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
        <CardTitle className="text-xs">{initial ? t("profiles.form.editTitle", { name: initial.name }) : t("profiles.form.newTitle")}</CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X /> {t("profiles.form.cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            <Save /> {initial ? t("profiles.form.save") : t("profiles.form.create")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{t("profiles.form.name")}</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("profiles.form.namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">{t("profiles.form.description")}</Label>
            <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("profiles.form.descriptionPlaceholder")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("profiles.form.icon")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {PROFILE_ICONS.map(({ name: n }) => (
              <button
                key={n}
                type="button"
                title={t(`profiles.icons.${n}`)}
                onClick={() => setIcon(n)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-none border transition-colors hover:bg-accent",
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
            <Label>{t("profiles.form.startFrom")}</Label>
            <Select
              onValueChange={(id) => {
                const base = profiles.find((p) => p.id === id)
                if (base) setPoints(base.points.map((p) => ({ ...p })))
              }}
            >
              <SelectTrigger className="w-56">
                <span className="text-muted-foreground">{t("profiles.form.copyCurve")}</span>
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
            <Label>{t("profiles.form.curve")}</Label>
            <Button size="sm" variant="outline" onClick={addPoint}>
              <Plus /> {t("profiles.form.step")}
            </Button>
          </div>
          <ZoneEditor points={points} onChange={setPoints} />
          <p className="text-muted-foreground">
            {t("profiles.form.help")}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
