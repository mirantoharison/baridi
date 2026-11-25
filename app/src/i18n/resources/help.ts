import { topicsEn } from "@/i18n/resources/help-topics-en"
import { topicsFr } from "@/i18n/resources/help-topics-fr"

/** Textes de la page Aide. */
export const help = {
  fr: {
    topicsTitle: "Comprendre les réglages",
    topicsHint: "Clique sur un sujet pour le déplier.",
    shortcutsTitle: "Raccourcis clavier",
    shortcutsOn: "Les raccourcis sont activés. Les changer se fait dans la page Raccourcis.",
    shortcutsOff: "Les raccourcis sont désactivés pour l'instant : on les active dans la page Raccourcis.",
    shortcuts: {
      speed10: "Ventilateur à 10 % (un second appui revient en Auto)",
      speed25: "Ventilateur à 25 %",
      speed50: "Ventilateur à 50 %",
      speed75: "Ventilateur à 75 %",
      nextProfile: "Profil suivant",
      toggleFull: "Plein régime / retour en Auto",
      toggleWidget: "Afficher ou masquer le mini-widget",
      toggleClickThrough: "Rendre le widget traversable par la souris",
    },
    changelogTitle: "Nouveautés",
    changelog: {
      v2: {
        title: "Version 2",
        items: [
          "Informations enrichies : mémoire, batterie, limitation du processeur, courbes, charge par cœur, capteurs supplémentaires.",
          "Historique sur 14 jours, diagnostic d'encrassement, résumé de la journée et rapports exportables.",
          "Automatisation : un profil ou un plan d'alimentation selon le programme lancé, la source d'alimentation ou le niveau de batterie.",
          "Second ventilateur piloté par sa propre courbe, test actif des ventilateurs et choix de la température de référence.",
          "Mini-widget transparent, icône de la barre des tâches avec la température, raccourcis clavier et alertes.",
          "Pages Capteurs, Carte graphique, Énergie et batterie, Rapports, Sauvegarde et Aide.",
          "Interface en français, anglais, espagnol, allemand, portugais et italien.",
        ],
      },
    },
    supportTitle: "Demander de l'aide",
    supportHint: "Génère un rapport (version, machine, état du ventilateur, réglages et dernières lignes du journal) à joindre à ton message. Il ne contient pas la clé de l'API.",
    copyReport: "Copier le rapport",
    copied: "Copié",
    saveReport: "Enregistrer le rapport",
    topics: topicsFr,
  },
  en: {
    topicsTitle: "Understanding the settings",
    topicsHint: "Click a topic to expand it.",
    shortcutsTitle: "Keyboard shortcuts",
    shortcutsOn: "Shortcuts are enabled. Change them in the Shortcuts page.",
    shortcutsOff: "Shortcuts are currently disabled: enable them in the Shortcuts page.",
    shortcuts: {
      speed10: "Fan at 10% (pressing again returns to Auto)",
      speed25: "Fan at 25%",
      speed50: "Fan at 50%",
      speed75: "Fan at 75%",
      nextProfile: "Next profile",
      toggleFull: "Full speed / back to Auto",
      toggleWidget: "Show or hide the mini widget",
      toggleClickThrough: "Let mouse clicks pass through the widget",
    },
    changelogTitle: "What's new",
    changelog: {
      v2: {
        title: "Version 2",
        items: [
          "Richer information: memory, battery, processor throttling, charts, per-core load, extra sensors.",
          "14-day history, dust build-up diagnosis, daily summary and exportable reports.",
          "Automation: a profile or power plan depending on the running program, power source or battery level.",
          "Second fan driven by its own curve, active fan test and a choice of reference temperature.",
          "Transparent mini widget, taskbar icon showing the temperature, keyboard shortcuts and alerts.",
          "Sensors, Graphics card, Energy and battery, Reports, Backup and Help pages.",
          "Interface in French, English, Spanish, German, Portuguese and Italian.",
        ],
      },
    },
    supportTitle: "Ask for help",
    supportHint: "Generates a report (version, machine, fan state, settings and the latest log lines) to attach to your message. It does not contain the API key.",
    copyReport: "Copy the report",
    copied: "Copied",
    saveReport: "Save the report",
    topics: topicsEn,
  },
}
