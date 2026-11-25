import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { AppSidebar } from "@/components/app-sidebar"
import { StatusBar } from "@/components/status-bar"
import { LanguageToggle } from "@/components/language-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useFan } from "@/hooks/use-fan"
import { useThermalAlerts } from "@/hooks/use-thermal-alerts"
import { useTrayIcon } from "@/hooks/use-tray-icon"
import { useGlobalShortcuts } from "@/hooks/use-shortcuts"
import { useNotificationsDenied } from "@/hooks/use-notifications-denied"
import { ALL_PAGES, DEFAULT_PAGE_ID, computeBadges } from "@/lib/nav"

const PAGE_KEY = "fancontroller:page"

/** Dernière page ouverte ; une page supprimée depuis (id inconnu) retombe sur la page par défaut. */
function readPageId(): string {
  try {
    const saved = localStorage.getItem(PAGE_KEY)
    if (saved && ALL_PAGES.some((p) => p.id === saved)) return saved
  } catch {
    /* stockage indisponible : on ouvre la page par défaut */
  }
  return DEFAULT_PAGE_ID
}

export default function App() {
  // Abonne App à la langue : les badges de navigation (calculés ici) sont retraduits au changement.
  const { t } = useTranslation()
  const fan = useFan()
  const s = fan.status
  useThermalAlerts(s, fan.online)
  useTrayIcon(s, fan.online)
  useGlobalShortcuts({
    status: s,
    profiles: fan.profiles,
    selectProfile: fan.selectProfile,
    setAuto: fan.setAuto,
    setManual: fan.setManual,
  })

  const notificationsDenied = useNotificationsDenied()
  const badges = computeBadges({ fan, notificationsDenied })

  const [pageId, setPageId] = useState(readPageId)
  const page = ALL_PAGES.find((p) => p.id === pageId) ?? ALL_PAGES[0]

  const selectPage = (id: string) => {
    setPageId(id)
    try {
      localStorage.setItem(PAGE_KEY, id)
    } catch {
      /* stockage indisponible : la page ne sera pas mémorisée */
    }
  }

  const PageIcon = page.icon

  return (
    <div className="flex h-full flex-col select-none bg-background text-xs">
      {fan.error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-6 py-2 text-destructive">
          <AlertTriangle className="size-4" /> {fan.error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <AppSidebar activeId={page.id} onSelect={selectPage} badges={badges} />

        {/* IMPORTANT : nav et contenu partagent le même fond (comme les Paramètres de Windows 11) ; seules les cartes
            ressortent. La barre de titre native de la fenêtre fait office d'en-tête : on ne la double pas. */}
        <main className="flex min-w-0 flex-1 flex-col px-6 pt-4">
          <div className="flex items-center justify-between pb-3">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <PageIcon className="size-5 text-primary" /> {t(page.labelKey)}
            </h1>
            <div className="flex items-center gap-1">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>

          {/* IMPORTANT : contenu en absolute inset-0 dans un parent relative, comme avant avec les onglets :
              c'est ce qui donne aux pages une hauteur bornée (graphes, listes) au lieu de les laisser grandir. */}
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0 pb-4">
              {/* key = id : changer de page remet le défilement en haut au lieu de garder la position de la précédente. */}
              {page.scroll === false ? (
                <div key={page.id} className="h-full">{page.render(fan)}</div>
              ) : (
                <ScrollArea key={page.id} className="h-full">
                  <div className="flex min-h-full flex-col pr-3">{page.render(fan)}</div>
                </ScrollArea>
              )}
            </div>
          </div>
        </main>
      </div>

      <StatusBar fan={fan} />
    </div>
  )
}
