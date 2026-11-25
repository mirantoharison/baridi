import { useEffect, useMemo, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { AppWindow, ChevronDown, Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchAppIcon, type AppEntry } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Au-delà, la liste n'affiche que les premiers résultats : des centaines de lignes (et d'icônes) à la fois ralentiraient l'ouverture. */
const MAX_RESULTS = 80

/** Icône d'un programme, chargée à l'affichage ; une icône générique tient la place tant qu'elle n'est pas là, ou s'il n'y en a pas. */
export function AppIcon({ name, className }: { name: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let isMounted = true
    setSrc(null)
    if (name) fetchAppIcon(name).then((u) => isMounted && setSrc(u))
    return () => {
      isMounted = false
    }
  }, [name])
  return src ? (
    <img src={src} alt="" className={cn("size-4 shrink-0", className)} />
  ) : (
    <AppWindow className={cn("size-4 shrink-0 text-muted-foreground", className)} />
  )
}

/**
 * Sélecteur de programme : liste des exécutables du système avec leur icône et une barre de recherche. Les programmes en
 * cours passent en premier. Un nom absent de la liste peut quand même être saisi (« Utiliser … »).
 */
export function AppPicker({ value, apps, onChange, onOpen, className }: {
  value: string
  apps: AppEntry[]
  onChange: (name: string) => void
  /** Appelé à chaque ouverture : permet de relire la liste (un programme a pu être lancé depuis). */
  onOpen?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    const filtered = apps.filter((a) => a.name.includes(q))
    // Les programmes lancés d'abord : ce sont ceux que l'on veut le plus souvent cibler.
    filtered.sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name))
    return filtered
  }, [apps, q])
  const isCustom = q.endsWith(".exe") && !/[\\/]/.test(q) && !apps.some((a) => a.name === q)

  const pick = (name: string) => {
    onChange(name)
    setIsOpen(false)
  }

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(o) => {
        setIsOpen(o)
        if (o) {
          setQuery("")
          onOpen?.()
        }
      }}
    >
      <Popover.Trigger
        className={cn(
          "flex h-8 w-fit items-center justify-between gap-2 rounded-none border border-input bg-transparent pr-2 pl-2.5 text-xs whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30 dark:hover:bg-input/50",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 font-mono">
          <AppIcon name={value} />
          {value ? <span className="truncate">{value}</span> : <span className="font-sans text-muted-foreground">{t("automation.picker.choose")}</span>}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Popover.Popup className="w-80 rounded-none font-sans text-xs bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <div className="relative border-b p-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={query} placeholder={t("automation.picker.search")} className="pl-7" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <ScrollArea className="h-64">
              <div className="p-1">
                {isCustom && (
                  <button type="button" className="flex w-full items-center gap-2 px-1.5 py-1 text-left hover:bg-accent" onClick={() => pick(q)}>
                    <AppIcon name="" /> {t("automation.picker.use", { name: q })}
                  </button>
                )}
                {results.slice(0, MAX_RESULTS).map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    className={cn("flex w-full items-center gap-2 px-1.5 py-1 text-left hover:bg-accent", a.name === value && "bg-accent")}
                    onClick={() => pick(a.name)}
                  >
                    <AppIcon name={a.name} />
                    <span className="flex-1 truncate font-mono">{a.name}</span>
                    {a.running && <span className="text-muted-foreground">{t("automation.picker.running")}</span>}
                  </button>
                ))}
                {results.length > MAX_RESULTS && (
                  <p className="px-1.5 py-1 text-muted-foreground">{t("automation.picker.more", { count: results.length - MAX_RESULTS })}</p>
                )}
                {results.length === 0 && !isCustom && (
                  <p className="px-1.5 py-2 text-muted-foreground">{apps.length === 0 ? t("automation.picker.unavailable") : t("automation.picker.notFound")}{t("automation.picker.typeFull")}</p>
                )}
              </div>
            </ScrollArea>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
