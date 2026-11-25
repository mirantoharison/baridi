import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Boîte de confirmation modale (alertdialog). Le focus démarre sur « Annuler » : l'option sûre est celle
 * qu'une frappe sur Entrée déclenche. Échap ou un clic à côté annulent.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  // IMPORTANT : portail dans <body> — un parent avec overflow ou transform (cartes, zones défilantes)
  // rognerait ou décalerait une boîte « fixed » rendue en place.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm space-y-4 rounded-none border bg-card p-5 text-xs text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="space-y-1.5">
            <h2 id="confirm-title" className="font-semibold">{title}</h2>
            <p id="confirm-message" className="text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} size="sm" variant="outline" onClick={onCancel}>
            {t("control.confirm.cancel")}
          </Button>
          <Button size="sm" onClick={onConfirm}>
            {confirmLabel ?? t("control.confirm.continueAnyway")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
