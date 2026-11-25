import { useState } from "react"
import { Menu } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FOOTER_PAGES, NAV_GROUPS, type NavBadge, type NavPage } from "@/lib/nav"
import { cn } from "@/lib/utils"

const COLLAPSED_KEY = "fancontroller:sidebar-collapsed"

/** Lu une seule fois à l'init : la barre garde son état d'un lancement à l'autre. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1"
  } catch {
    return false
  }
}

interface Props {
  activeId: string
  onSelect: (id: string) => void
  /** Pastilles à afficher, par identifiant de page (voir computeBadges). */
  badges: Record<string, NavBadge>
}

function NavButton({ page, active, collapsed, badge, onSelect }: {
  page: NavPage
  active: boolean
  collapsed: boolean
  badge?: NavBadge
  onSelect: (id: string) => void
}) {
  const Icon = page.icon
  // Le badge est annoncé aux lecteurs d'écran : la couleur seule ne dit rien à tout le monde.
  const label = badge ? `${page.label} — ${badge.reason}` : page.label
  const button = (
    <button
      type="button"
      onClick={() => onSelect(page.id)}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed || badge ? label : undefined}
      title={badge && !collapsed ? badge.reason : undefined}
      className={cn(
        "relative flex h-9 w-full items-center gap-3 rounded-none px-3 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        // Repère d'accent vertical sur l'entrée active, signature de la navigation des Paramètres Windows.
        active
          ? "bg-accent font-medium text-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:bg-primary"
          : "text-foreground/80 hover:bg-accent/60 hover:text-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{page.label}</span>}
      {badge && (
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-none",
            badge.level === "fail" ? "bg-hot" : "bg-amber-500",
            collapsed ? "absolute top-1 right-1" : "ml-auto",
          )}
        />
      )}
    </button>
  )

  // Réduite, seule l'icône reste : le nom (et la raison du badge) passe dans une infobulle pour ne pas rendre la barre muette.
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Barre de navigation latérale générée depuis NAV_GROUPS (lib/nav.tsx). Réductible en barre d'icônes
 * pour laisser la place au contenu dans une fenêtre qui fait 800 px au minimum.
 */
export function AppSidebar({ activeId, onSelect, badges }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0")
    } catch {
      /* stockage indisponible : l'état vaut pour cette session seulement */
    }
  }

  return (
    <TooltipProvider>
      <nav
        aria-label="Navigation principale"
        className={cn("flex shrink-0 flex-col justify-between py-2 transition-[width]", collapsed ? "w-12 px-1" : "w-52 px-1.5")}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Développer la barre latérale" : "Réduire la barre latérale"}
          className="mb-2 flex h-9 w-full shrink-0 items-center gap-3 px-3 text-foreground/80 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="size-4 shrink-0" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col gap-3 -mx-1 overflow-y-auto overflow-x-hidden px-1">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              {collapsed ? (
                i > 0 && <div className="mx-2 mb-1 border-t" />
              ) : (
                <div className="px-3 pb-1 text-[10px] font-medium text-muted-foreground">{group.label}</div>
              )}
              {group.pages.map((page) => (
                <NavButton key={page.id} page={page} active={page.id === activeId} collapsed={collapsed} badge={badges[page.id]} onSelect={onSelect} />
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-0.5 pt-2">
          {FOOTER_PAGES.map((page) => (
            <NavButton key={page.id} page={page} active={page.id === activeId} collapsed={collapsed} badge={badges[page.id]} onSelect={onSelect} />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  )
}
