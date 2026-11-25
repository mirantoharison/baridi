import type { ComponentType, ReactNode } from "react"
import { Activity, BatteryFull, Bell, BookOpen, Cpu, DatabaseBackup, Download, FileBarChart, History, Gauge, Info, Keyboard, LifeBuoy, ListChecks, ScrollText, Server, Settings2, Stethoscope, Zap } from "lucide-react"
import { AboutTab } from "@/components/about-tab"
import { BackupTab } from "@/components/backup-tab"
import { EnergyTab } from "@/components/energy-tab"
import { GpuTab } from "@/components/gpu-tab"
import { HelpTab } from "@/components/help-tab"
import { ReportsTab } from "@/components/reports-tab"
import { SensorsTab } from "@/components/sensors-tab"
import { AutomationTab } from "@/components/automation-tab"
import { AlertsCard } from "@/components/alerts-card"
import { DiagnosticTab } from "@/components/diagnostic-tab"
import { HistoryTab } from "@/components/history-tab"
import { InfoTab } from "@/components/info-tab"
import { LogsTab } from "@/components/logs-tab"
import { PilotageTab } from "@/components/pilotage-tab"
import { ProfilesTab } from "@/components/profiles-tab"
import { ServiceCard } from "@/components/service-card"
import { SettingsTab } from "@/components/settings-tab"
import { UpdatesTab } from "@/components/updates-tab"
import { ShortcutsCard } from "@/components/shortcuts-card"
import type { useFan } from "@/hooks/use-fan"
import i18n from "@/i18n"

/** Même gabarit que les autres pages (colonne qui remplit la hauteur, espacement entre cartes). */
function PageStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col gap-4">{children}</div>
}

/** État et actions du contrôleur, partagés avec toutes les pages. */
export type Fan = ReturnType<typeof useFan>

/** Pastille sur une entrée de la barre : « warn » = à regarder, « fail » = ne fonctionne pas. `reason` dit pourquoi (infobulle et lecteurs d'écran). */
export interface NavBadge {
  level: "warn" | "fail"
  reason: string
}

/** Ce que les pages peuvent consulter pour décider d'afficher un badge. */
export interface BadgeContext {
  fan: Fan
  /** Windows refuse les notifications à l'application. */
  notificationsDenied: boolean
}

export interface NavPage {
  id: string
  /** Clé de traduction du libellé (résolue à l'affichage, pour suivre le changement de langue). */
  labelKey: string
  icon: ComponentType<{ className?: string }>
  /**
   * La coque enveloppe la page dans une zone défilante. À passer à false pour une page qui gère
   * son propre défilement (ex. Logs : liste virtualisée ou en-tête fixe).
   */
  scroll?: boolean
  /** Optionnel : renvoie un badge à afficher sur l'entrée, ou null. Évalué à chaque rendu — rester léger et sans effet de bord. */
  badge?: (ctx: BadgeContext) => NavBadge | null
  render: (fan: Fan) => ReactNode
}

export interface NavGroup {
  /** Clé de traduction du titre affiché au-dessus du groupe (masqué quand la barre est réduite). */
  labelKey: string
  pages: NavPage[]
}

/**
 * IMPORTANT : source unique de la navigation. Pour ajouter une fonctionnalité, on ajoute une entrée ici
 * (et son composant) : ni la barre latérale ni App.tsx n'ont à changer. L'ordre du tableau est l'ordre affiché.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "common.nav.surveillance",
    pages: [
      { id: "info", labelKey: "common.nav.info", icon: Info, render: (fan) => <InfoTab fan={fan} /> },
      { id: "capteurs", labelKey: "common.nav.sensors", icon: Activity, render: (fan) => <SensorsTab fan={fan} /> },
      { id: "gpu", labelKey: "common.nav.gpu", icon: Cpu, render: (fan) => <GpuTab fan={fan} /> },
      { id: "energie", labelKey: "common.nav.energy", icon: BatteryFull, render: (fan) => <EnergyTab fan={fan} /> },
      { id: "historique", labelKey: "common.nav.history", icon: History, render: (fan) => <PageStack><HistoryTab batteryDetails={fan.status?.battery_details} profiles={fan.profiles} activeProfileId={fan.status?.profile} onSaveProfile={fan.saveProfile} /></PageStack> },
    ],
  },
  {
    labelKey: "common.nav.control",
    pages: [
      {
        id: "pilotage",
        labelKey: "common.nav.pilotage",
        icon: Gauge,
        render: (fan) => (
          <PilotageTab
            status={fan.status}
            profiles={fan.profiles}
            onAuto={fan.setAuto}
            onManual={fan.setManual}
            onStop={fan.stop}
            onSelectProfile={fan.selectProfile}
            onFan2={fan.setFan2}
            onFan2Curve={fan.setFan2Curve}
          />
        ),
      },
      {
        id: "profils",
        labelKey: "common.nav.profiles",
        icon: ListChecks,
        render: (fan) => (
          <ProfilesTab
            profiles={fan.profiles}
            status={fan.status}
            onActivate={fan.selectProfile}
            onSave={fan.saveProfile}
            onDelete={fan.deleteProfile}
          />
        ),
      },
      {
        id: "automatisation",
        labelKey: "common.nav.automation",
        icon: Zap,
        render: (fan) => <PageStack><AutomationTab profiles={fan.profiles} /></PageStack>,
      },
    ],
  },
  {
    labelKey: "common.nav.configuration",
    pages: [
      {
        id: "alertes",
        labelKey: "common.nav.alerts",
        icon: Bell,
        badge: ({ notificationsDenied }) =>
          notificationsDenied ? { level: "warn", reason: i18n.t("common.badges.notificationsDenied") } : null,
        render: () => <PageStack><AlertsCard /></PageStack>,
      },
      { id: "raccourcis", labelKey: "common.nav.shortcuts", icon: Keyboard, render: () => <PageStack><ShortcutsCard /></PageStack> },
      {
        id: "service",
        labelKey: "common.nav.service",
        icon: Server,
        render: () => (
          <PageStack>
            <ServiceCard />
          </PageStack>
        ),
      },
    ],
  },
  {
    labelKey: "common.nav.system",
    pages: [
      {
        id: "reglages",
        labelKey: "common.nav.settings",
        icon: Settings2,
        render: (fan) => (
          <SettingsTab
            curveMode={fan.status?.curve_mode ?? "steep"}
            onCurveMode={fan.setCurveMode}
            status={fan.status}
            onTuning={fan.setTuning}
            onTempSource={fan.setTempSource}
          />
        ),
      },
      {
        id: "diagnostic",
        labelKey: "common.nav.diagnostic",
        icon: Stethoscope,
        // Contrôle passif, sans toucher au ventilateur : pas de test actif ici (voir DiagnosticTab).
        badge: ({ fan }) => {
          if (!fan.online) return { level: "fail", reason: i18n.t("common.badges.controllerDown") }
          if (fan.status && fan.status.temp_c <= 0) return { level: "fail", reason: i18n.t("common.badges.tempUnreadable") }
          return null
        },
        render: (fan) => <DiagnosticTab fan={fan} />,
      },
      { id: "rapports", labelKey: "common.nav.reports", icon: FileBarChart, render: () => <ReportsTab /> },
      { id: "sauvegarde", labelKey: "common.nav.backup", icon: DatabaseBackup, render: (fan) => <BackupTab fan={fan} /> },
      { id: "aide", labelKey: "common.nav.help", icon: LifeBuoy, render: (fan) => <HelpTab fan={fan} /> },
      { id: "mises-a-jour", labelKey: "common.nav.updates", icon: Download, render: () => <UpdatesTab /> },
      { id: "logs", labelKey: "common.nav.logs", icon: ScrollText, scroll: false, render: () => <LogsTab /> },
    ],
  },
]

/** Épinglé en bas de la barre, séparé des groupes. */
export const FOOTER_PAGES: NavPage[] = [
  { id: "about", labelKey: "common.nav.about", icon: BookOpen, scroll: false, render: () => <AboutTab /> },
]

export const ALL_PAGES: NavPage[] = [...NAV_GROUPS.flatMap((g) => g.pages), ...FOOTER_PAGES]
export const DEFAULT_PAGE_ID = ALL_PAGES[0].id

/** Badges de toutes les pages qui en déclarent un, par identifiant de page. */
export function computeBadges(ctx: BadgeContext): Record<string, NavBadge> {
  const badges: Record<string, NavBadge> = {}
  for (const page of ALL_PAGES) {
    const badge = page.badge?.(ctx)
    if (badge) badges[page.id] = badge
  }
  return badges
}
