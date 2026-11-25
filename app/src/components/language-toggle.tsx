import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { setLanguage, type Language } from "@/i18n"

/**
 * Bouton de langue, à côté du thème : il affiche la langue ACTUELLE (« FR » ou « EN ») et bascule vers l'autre. Deux
 * langues seulement, donc un simple bouton plutôt qu'un menu.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation()
  const current = (i18n.language === "en" ? "en" : "fr") as Language
  const next: Language = current === "fr" ? "en" : "fr"
  const label = t("common.language.switchTo", { language: t(`common.language.${next}`) })

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="font-mono font-semibold" onClick={() => setLanguage(next)} aria-label={label}>
              {current.toUpperCase()}
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
