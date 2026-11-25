import { Plug, Unplug } from "lucide-react"
import type { Fan } from "@/lib/nav"
import { cn } from "@/lib/utils"

/** Cellule de la barre d'état : séparée de sa voisine par un filet vertical, comme dans l'Explorateur Windows. */
function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1.5 border-l px-3 first:border-l-0 first:pl-4", className)}>{children}</div>
}

/**
 * Barre d'état en bas de la fenêtre : connexion au contrôleur et mesures clés, visibles quelle que soit la page.
 * IMPORTANT : elle remplace l'icône de connexion de l'ancien en-tête — l'info reste en permanence à l'écran
 * mais ne prend plus de place en haut, où la barre de titre native de Windows fait déjà office d'en-tête.
 */
export function StatusBar({ fan }: { fan: Fan }) {
  const s = fan.status
  const Icon = fan.online ? Plug : Unplug

  return (
    <footer role="status" className="flex h-6 shrink-0 items-center border-t bg-card text-muted-foreground">
      <Cell className={fan.online ? "text-green-500" : "animate-pulse text-hot"}>
        <Icon className="size-3.5" />
        <span>{fan.online ? "Contrôleur connecté" : "Connexion au contrôleur…"}</span>
      </Cell>
      {s && (
        <>
          <Cell>
            CPU <span className="font-mono text-foreground tabular-nums">{s.temp_c}°C</span>
          </Cell>
          <Cell>
            Ventilateur <span className="font-mono text-foreground tabular-nums">{s.rpm} RPM</span>
            <span className="font-mono tabular-nums">({s.percent}%)</span>
          </Cell>
          <Cell>
            Mode <span className="text-foreground">{s.mode}</span>
          </Cell>
          <Cell>
            Profil <span className="text-foreground">{s.profile}</span>
          </Cell>
        </>
      )}
    </footer>
  )
}
