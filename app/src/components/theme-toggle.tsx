import { useCallback, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type Theme = "light" | "dark"

const STORAGE_KEY = "theme"

/**
 * Thème actuel, lu sur <html> : le script d'index.html l'y a posé avant le premier rendu
 * (sinon la page clignoterait en clair au démarrage).
 */
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/** Deux thèmes uniquement — clair et sombre, sans option « système ». Le choix est mémorisé. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    document.documentElement.classList.toggle("dark", next === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* stockage indisponible : le thème vaut pour cette session seulement */
    }
    setTheme(next)
  }, [theme])

  return { theme, toggle }
}

/** Petit bouton icône pour basculer entre thème clair et thème sombre. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={label}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
