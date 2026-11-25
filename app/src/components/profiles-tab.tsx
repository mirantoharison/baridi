import { useState } from "react"
import { Check, Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CurveEditor } from "@/components/curve-editor"
import { InfoNote } from "@/components/info-note"
import { MiniCurve } from "@/components/mini-curve"
import { ProfileForm } from "@/components/profile-form"
import { ProfileIcon } from "@/lib/profile-icons"
import type { FanProfile, FanStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Props {
  profiles: FanProfile[]
  status: FanStatus | null
  onActivate: (id: string) => void
  onSave: (p: FanProfile) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

type View = "view" | "edit" | "new" | "duplicate"

// La liste affiche au plus 4 profils ; au-delà elle défile. Hauteur d'une ligne (h-10) + espacement (gap-1).
const VISIBLE_ROWS = 4
const ROW_PX = 40
const GAP_PX = 4

/** Brique du haut : liste défilante des profils (4 visibles max). Brique du bas : détail / édition du profil sélectionné. */
export function ProfilesTab({ profiles, status, onActivate, onSave, onDelete }: Props) {
  const { t } = useTranslation()
  const activeId = status?.profile
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>("view")

  const selected = profiles.find((p) => p.id === (selectedId ?? activeId)) ?? profiles[0]
  const isUser = selected?.source === "user"
  const isActive = selected?.id === activeId

  const select = (id: string) => {
    setSelectedId(id)
    setView("view")
  }

  const rows = Math.min(Math.max(profiles.length, 1), VISIBLE_ROWS)
  const listHeight = rows * ROW_PX + (rows - 1) * GAP_PX

  const form = view !== "view" && (
    <ProfileForm
      key={`${view}-${selected?.id}`}
      profiles={profiles}
      curveMode={status?.curve_mode}
      initial={view === "edit" ? selected : undefined}
      base={view === "duplicate" ? selected : undefined}
      onCancel={() => setView("view")}
      onSave={async (p) => {
        await onSave(p)
        select(p.id)
      }}
    />
  )

  return (
    <div className="flex flex-1 flex-col gap-4">
      <InfoNote summary={<Trans i18nKey="profiles.summary" components={{ b: <b /> }} />}>
        <Trans i18nKey="profiles.details" components={{ b: <b />, code: <code /> }} />
      </InfoNote>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs">{t("profiles.listTitle", { count: profiles.length })}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setView("new")}>
            <Plus /> {t("profiles.newProfile")}
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea style={{ height: listHeight }}>
            <div className="flex flex-col gap-1 pr-3">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => select(p.id)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-3 rounded-none px-3 text-left transition-colors hover:bg-accent",
                    selected?.id === p.id && view === "view" && "bg-accent",
                  )}
                >
                  <ProfileIcon name={p.icon} />
                  <span className="w-32 truncate font-medium">{p.name}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {p.description || t("profiles.points", { count: p.points.length })}
                  </span>
                  <MiniCurve points={p.points} mode={status?.curve_mode} />
                  {p.source !== "user" ? <Lock className="size-3 text-muted-foreground" /> : <span className="size-3" />}
                  {activeId === p.id ? <Check className="size-3.5 text-green-500" /> : <span className="size-3.5" />}
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-1 flex-col">
        {form ||
          (selected && (
            <Card className="flex-1">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-none bg-muted">
                    <ProfileIcon name={selected.icon} className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {selected.name}
                      <Badge variant="secondary">{isUser ? t("profiles.custom") : t("profiles.system")}</Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {selected.description || t("profiles.points", { count: selected.points.length })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={isActive ? "secondary" : "default"}
                    disabled={isActive}
                    className="w-24 disabled:opacity-100"
                    onClick={() => onActivate(selected.id)}
                  >
                    <Check /> {isActive ? t("profiles.active") : t("profiles.activate")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setView("duplicate")}>
                    <Copy /> {t("profiles.duplicate")}
                  </Button>
                  {isUser && (
                    <>
                      <Button size="icon" variant="ghost" aria-label={t("profiles.edit")} onClick={() => setView("edit")}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={t("profiles.delete")}
                        onClick={async () => {
                          await onDelete(selected.id)
                          setSelectedId(null)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <CurveEditor
                  points={selected.points}
                  temp={status?.temp_c}
                  mode={status?.curve_mode}
                  className="min-h-60 flex-1"
                />
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  )
}
