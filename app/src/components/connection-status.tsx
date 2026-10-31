import { Plug, Unplug } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** État de la connexion au contrôleur : une icône et une couleur seulement, le texte est dans l'infobulle. */
export function ConnectionStatus({ online }: { online: boolean }) {
  const label = online ? "Contrôleur connecté" : "Connexion au contrôleur…"
  const Icon = online ? Plug : Unplug

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="status"
              aria-label={label}
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                online ? "text-green-500" : "animate-pulse text-hot",
              )}
            >
              <Icon className="size-4" />
            </span>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
