import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { Check } from "lucide-react"
import { DE, ES, FR, GB, IT, PT } from "country-flag-icons/react/3x2"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { LANGUAGES, setLanguage, type Language } from "@/i18n"
import { cn } from "@/lib/utils"

/**
 * Drapeaux (SVG embarqués : Windows n'affiche pas les emoji de drapeau, il les remplace par deux lettres). L'anglais
 * porte le drapeau britannique, la langue d'origine.
 */
const FLAGS: Record<Language, typeof FR> = { fr: FR, en: GB, es: ES, de: DE, pt: PT, it: IT }

function Flag({ code, className }: { code: Language; className?: string }) {
  const Icon = FLAGS[code]
  return <Icon aria-hidden className={cn("h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.15)]", className)} />
}

/**
 * Sélecteur de langue, à côté du thème : le bouton montre le drapeau de la langue actuelle, la liste propose les autres
 * (nom écrit dans sa propre langue). Le choix est mémorisé.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const current = (LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : "fr") as Language

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger render={<Button variant="ghost" size="icon-sm" aria-label={t("common.language.choose")} title={t("common.language.choose")} />}>
        <Flag code={current} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="isolate z-50">
          <Popover.Popup className="w-44 rounded-none bg-popover p-1 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            {LANGUAGES.map(({ code, name }) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLanguage(code)
                  setIsOpen(false)
                }}
                className={cn("flex w-full items-center gap-2.5 px-2 py-1.5 text-left hover:bg-accent", code === current && "bg-accent")}
              >
                <Flag code={code} />
                <span className="flex-1">{name}</span>
                {code === current && <Check className="size-3.5" />}
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
