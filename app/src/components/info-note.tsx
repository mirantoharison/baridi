import { useState } from "react"
import { ChevronDown, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  /** Phrase courte, toujours visible. */
  summary: React.ReactNode
  /** Détail optionnel, replié par défaut. Mettre les termes clés en <b>. */
  children?: React.ReactNode
  className?: string
}

/** Encart descriptif (style Alert shadcn) : une phrase + un détail repliable. */
export function InfoNote({ summary, children, className }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div
      role="note"
      className={cn(
        "rounded-lg border border-sky-400/30 bg-sky-400/5 p-3 text-xs leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-4 shrink-0 text-sky-400" />
        <p className="flex-1">{summary}</p>
        {children && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex shrink-0 items-center gap-1 text-foreground hover:underline"
          >
            Détails <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {children && open && <p className="mt-2 pl-7">{children}</p>}
    </div>
  )
}
