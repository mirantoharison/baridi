/** Textes de la page Pilotage et de ses cartes : mode, ventilateur 2, plan d'alimentation, garde-fous, confirmation. */
export const control = {
  fr: {
    confirm: { cancel: "Annuler", continueAnyway: "Continuer quand même" },
    guards: {
      manual: "Le processeur est à {{temp}}° et la vitesse demandée est de {{percent}} %. En dessous de {{min}} %, il risque de continuer à chauffer : rien ne régulera la vitesse tant que tu restes en mode Manuel.",
      stop: "Le processeur est à {{temp}}°. En mode Arrêt, le ventilateur garde sa dernière vitesse sans plus s'adapter à la température : si elle monte, rien ne l'accélérera.",
      lowSpeedTitle: "Vitesse manuelle faible",
      stopTitle: "Couper le pilotage automatique ?",
    },
    card: {
      title: "Pilotage",
      modes: { auto: "Auto", manual: "Manuel", idle: "Arrêt" },
      manualSpeed: "Vitesse manuelle",
      autoText:
        "Le mode Auto est actif : toutes les 2 secondes, le contrôleur relève la température du processeur, détermine la vitesse prévue par la courbe du profil actif, puis y amène progressivement le ventilateur, par petites étapes pour éviter les changements de régime brutaux. Tu n'as rien à régler ici : change simplement de profil actif ci-dessous si tu veux un comportement plus silencieux ou plus rafraîchissant. Choisis Manuel si tu veux fixer toi-même la vitesse, par exemple pour un test de bruit ou pour forcer un refroidissement maximal avant une tâche lourde ; le curseur apparaîtra alors à cet endroit.",
      idleText:
        "Le pilotage automatique est coupé : le contrôleur ne lit plus la température pour ajuster la vitesse, et le ventilateur reste sur la dernière vitesse appliquée jusqu'à ton prochain choix, sans que le comportement d'origine de la machine reprenne la main. Garde un œil sur la température dans l'onglet Info, car rien ne la fera redescendre tant que tu n'as pas relancé le mode Auto ou fixé une vitesse en mode Manuel. Si tu comptes laisser l'ordinateur sans surveillance, repasse en Auto : c'est le mode le plus sûr, puisque la vitesse s'adapte alors à la température à chaque instant.",
    },
    tab: {
      summary:
        "Cet onglet sert à <b>piloter le ventilateur en direct</b>. Tu y choisis le <b>mode de fonctionnement</b> (Auto, Manuel ou Arrêt), tu fixes la vitesse à la main quand tu veux reprendre la main, et tu sélectionnes le <b>profil actif</b> dont la courbe décide de la vitesse en mode Auto. La courbe affichée en bas montre exactement ce que le contrôleur applique, avec un repère vertical qui suit la température du processeur en temps réel : tu vois donc à tout moment où tu te situes sur la courbe et quelle vitesse en découle. Toutes les actions de cet onglet sont envoyées immédiatement au contrôleur et consignées dans l'onglet Logs, ce qui permet de vérifier a posteriori ce qui a été demandé et à quelle heure.",
      details:
        "En mode <b>Auto</b>, le contrôleur lit la température toutes les 2 secondes, calcule la vitesse cible à partir de la courbe du profil actif, puis rejoint cette cible par petites étapes successives plutôt que d'un seul coup (par défaut, 5 unités de PWM toutes les 50 millisecondes), ce qui évite les à-coups de bruit ; la transition ne repart que si la cible a réellement changé. Le contrôleur démarre toujours en Auto, avec le dernier profil utilisé, y compris lorsqu'il est lancé comme service avant même que tu ouvres l'application. En mode <b>Manuel</b>, le pilotage automatique est coupé et la vitesse que tu choisis (par pas de 5 %, avec des préréglages à 25, 50, 75 et 100 %) est appliquée telle quelle, quelle que soit la température : pense à surveiller celle-ci dans l'onglet Info. La valeur n'est envoyée qu'une fraction de seconde après que tu as lâché le curseur, pour ne pas inonder le contrôleur de requêtes pendant que tu le fais glisser. En mode <b>Arrêt</b>, le pilotage automatique est simplement suspendu et la vitesse en cours est conservée, sans retour au comportement d'origine de la machine : rien ne fera redescendre la température tant que tu n'as pas relancé le mode Auto. Changer de profil actif prend effet au prochain relevé en mode Auto, soit au plus tard 2 secondes plus tard, et ce choix est mémorisé pour le prochain lancement. Quand l'ordinateur se met en veille, le contrôleur suspend le pilotage automatique, puis le relance à la sortie de veille. À la fermeture de l'application, ou à l'arrêt de Windows, il ramène le ventilateur sur le profil Balanced avant de s'arrêter, pour ne jamais laisser la machine sur une vitesse figée. Si le contrôleur tourne comme service Windows, fermer l'application ne l'arrête pas : le pilotage continue.",
      activeProfile: "Profil actif",
      chooseProfile: "Choisir un profil",
      custom: "Custom",
      noProfile: "Aucun profil sélectionné.",
    },
    fan2: {
      title: "Ventilateur 2",
      modes: { firmware: "BIOS", follow: "Suivre le 1", manual: "Manuel", curve: "Courbe" },
      descriptions: {
        firmware:
          "Le BIOS de la carte mère pilote ce ventilateur. Au démarrage, c'est le mode par défaut et il n'a aucun effet sur le ventilateur 1. Mais y revenir après « Suivre le 1 » ou « Manuel » coupe le mode test de la DLL, ce qui rend AUSSI le ventilateur 1 au BIOS : la courbe de ton profil est alors ignorée tant que ce mode reste actif. Le BIOS garde la machine au frais, mais il ne suit plus tes réglages.",
        follow:
          "Ce ventilateur reçoit la même consigne que le ventilateur 1 : il suit donc la courbe du profil actif, y compris le lissage et l'hystérésis. La consigne est réécrite par paliers d'environ 4 % pour ne pas ralentir la montée en vitesse.",
        manual:
          "Tu fixes toi-même la vitesse de ce ventilateur. Elle est maintenue quelle que soit la température du processeur, sauf au-delà de 85° où il repasse tout seul en mode « Suivre le 1 ». Ce choix n'est jamais mémorisé : au prochain lancement, il redevient piloté par le firmware.",
        curve:
          "Ce ventilateur a sa propre courbe, indépendante du profil, calée sur la température de ton choix. Sur ce portable c'est celui de la carte graphique : le caler sur la GPU le fait accélérer quand un jeu la sollicite, même si le processeur reste frais. La température de la carte n'est lue que si elle est déjà allumée : l'application ne la réveille jamais, et se rabat sur celle du processeur quand elle dort. Au-delà de 85° (processeur), il repasse en « Suivre le 1 ». Cette courbe est mémorisée.",
      },
      sources: { cpu: "Température du processeur", gpu: "Température de la carte graphique", max: "La plus haute des deux" },
      manualSpeed: "Vitesse manuelle",
      basedOn: "Calée sur",
      applyCurve: "Appliquer la courbe",
      biosOverride: "Le BIOS pilote actuellement les <b>deux</b> ventilateurs : la courbe de ton profil est ignorée, même si la page Pilotage affiche « Auto ». Choisis « Suivre le 1 » ou « Manuel » pour la retrouver.",
      biosConfirmTitle: "Passer en mode BIOS ?",
      biosConfirmMessage: "Le BIOS va piloter les deux ventilateurs, y compris le ventilateur 1 : la courbe de ton profil sera ignorée tant que tu restes dans ce mode. Pour la retrouver, choisis « Suivre le 1 » ou « Manuel ».",
      biosConfirmLabel: "Passer en BIOS",
    },
    powerPlan: {
      title: "Plan d'alimentation Windows",
      description: "Le plan de Windows règle la puissance maximale du processeur et la mise en veille, en plus de ton profil de ventilateur. Le changement s'applique à toute la machine.",
      customActive: " Un plan personnalisé est actif : choisir un plan standard le remplace.",
      currently: "Actuellement : {{plan}}",
      plans: { "Équilibré": "Équilibré", "Performances élevées": "Performances élevées", "Performances maximales": "Performances maximales", "Économie d'énergie": "Économie d'énergie", "Personnalisé": "Personnalisé" },
    },
    tempSource: {
      title: "Température suivie par la courbe",
      description: "Choisis ce qui pilote le ventilateur 1 en mode Auto. La température de la carte graphique n'est lue que si la carte est déjà allumée : l'application ne la réveille jamais, et quand elle dort c'est la température du processeur qui s'applique. Le ventilateur 2 a sa propre source, réglée dans sa carte de la page Pilotage.",
      cpuTitle: "Processeur seul",
      cpuText: "La courbe du ventilateur 1 suit uniquement la température du processeur. C'est le comportement d'origine.",
      maxTitle: "La plus haute : processeur ou carte graphique",
      maxText: "La courbe suit la température la plus élevée des deux. Un jeu qui chauffe la carte graphique accélère le ventilateur même si le processeur reste frais.",
    },
  },
  en: {
    confirm: { cancel: "Cancel", continueAnyway: "Continue anyway" },
    guards: {
      manual: "The processor is at {{temp}}° and the requested speed is {{percent}} %. Below {{min}} %, it may keep heating up: nothing will regulate the speed while you stay in Manual mode.",
      stop: "The processor is at {{temp}}°. In Off mode, the fan keeps its last speed and no longer adapts to the temperature: if it rises, nothing will speed it up.",
      lowSpeedTitle: "Low manual speed",
      stopTitle: "Stop automatic control?",
    },
    card: {
      title: "Control",
      modes: { auto: "Auto", manual: "Manual", idle: "Off" },
      manualSpeed: "Manual speed",
      autoText:
        "Auto mode is active: every 2 seconds, the controller reads the processor temperature, determines the speed set by the active profile's curve, then brings the fan there gradually, in small steps to avoid abrupt changes in speed. There is nothing to set here: just change the active profile below if you want quieter or cooler behavior. Choose Manual if you want to set the speed yourself, for example for a noise test or to force maximum cooling before a heavy task; the slider will then appear here.",
      idleText:
        "Automatic control is off: the controller no longer reads the temperature to adjust the speed, and the fan stays at the last speed applied until your next choice, without the machine's original behavior taking over. Keep an eye on the temperature in the Info tab, because nothing will bring it down until you restart Auto mode or set a speed in Manual mode. If you plan to leave the computer unattended, switch back to Auto: it is the safest mode, since the speed then adapts to the temperature at every moment.",
    },
    tab: {
      summary:
        "This tab is used to <b>control the fan live</b>. You choose the <b>operating mode</b> (Auto, Manual or Off), set the speed by hand when you want to take over, and select the <b>active profile</b> whose curve decides the speed in Auto mode. The curve shown at the bottom shows exactly what the controller applies, with a vertical marker that follows the processor temperature in real time: you can see at any moment where you stand on the curve and what speed results. Every action in this tab is sent to the controller immediately and recorded in the Logs tab, so you can check afterwards what was requested and when.",
      details:
        "In <b>Auto</b> mode, the controller reads the temperature every 2 seconds, computes the target speed from the active profile's curve, then reaches that target in successive small steps rather than all at once (by default, 5 PWM units every 50 milliseconds), which avoids noise spikes; the transition only restarts if the target has really changed. The controller always starts in Auto, with the last profile used, including when it is launched as a service before you even open the application. In <b>Manual</b> mode, automatic control is off and the speed you choose (in steps of 5 %, with presets at 25, 50, 75 and 100 %) is applied as is, whatever the temperature: remember to watch it in the Info tab. The value is only sent a fraction of a second after you release the slider, so as not to flood the controller with requests while you drag it. In <b>Off</b> mode, automatic control is simply suspended and the current speed is kept, with no return to the machine's original behavior: nothing will bring the temperature down until you restart Auto mode. Changing the active profile takes effect at the next reading in Auto mode, i.e. 2 seconds later at most, and this choice is remembered for the next launch. When the computer goes to sleep, the controller suspends automatic control, then resumes it on wake-up. When the application closes, or Windows shuts down, it returns the fan to the Balanced profile before stopping, so the machine is never left at a frozen speed. If the controller runs as a Windows service, closing the application does not stop it: control continues.",
      activeProfile: "Active profile",
      chooseProfile: "Choose a profile",
      custom: "Custom",
      noProfile: "No profile selected.",
    },
    fan2: {
      title: "Fan 2",
      modes: { firmware: "BIOS", follow: "Follow 1", manual: "Manual", curve: "Curve" },
      descriptions: {
        firmware:
          "The motherboard BIOS controls this fan. At startup, this is the default mode and it has no effect on fan 1. But returning to it after “Follow 1” or “Manual” turns off the DLL's test mode, which ALSO hands fan 1 back to the BIOS: your profile's curve is then ignored as long as this mode stays active. The BIOS keeps the machine cool, but it no longer follows your settings.",
        follow:
          "This fan receives the same setpoint as fan 1: it therefore follows the active profile's curve, including smoothing and hysteresis. The setpoint is rewritten in steps of about 4 % so as not to slow down the speed ramp-up.",
        manual:
          "You set this fan's speed yourself. It is held whatever the processor temperature, except above 85° where it automatically goes back to “Follow 1” mode. This choice is never remembered: at the next launch, it is controlled by the firmware again.",
        curve:
          "This fan has its own curve, independent of the profile, based on the temperature of your choice. On this laptop it is the graphics card's fan: basing it on the GPU makes it speed up when a game stresses it, even if the processor stays cool. The card's temperature is only read if it is already awake: the application never wakes it, and falls back to the processor's when it sleeps. Above 85° (processor), it goes back to “Follow 1”. This curve is remembered.",
      },
      sources: { cpu: "Processor temperature", gpu: "Graphics card temperature", max: "The higher of the two" },
      manualSpeed: "Manual speed",
      basedOn: "Based on",
      applyCurve: "Apply the curve",
      biosOverride: "The BIOS is currently controlling <b>both</b> fans: your profile's curve is ignored, even if the Control page shows “Auto”. Choose “Follow 1” or “Manual” to get it back.",
      biosConfirmTitle: "Switch to BIOS mode?",
      biosConfirmMessage: "The BIOS will control both fans, including fan 1: your profile's curve will be ignored as long as you stay in this mode. To get it back, choose “Follow 1” or “Manual”.",
      biosConfirmLabel: "Switch to BIOS",
    },
    powerPlan: {
      title: "Windows power plan",
      description: "The Windows plan sets the processor's maximum power and sleep behavior, in addition to your fan profile. The change applies to the whole machine.",
      customActive: " A custom plan is active: choosing a standard plan replaces it.",
      currently: "Currently: {{plan}}",
      plans: { "Équilibré": "Balanced", "Performances élevées": "High performance", "Performances maximales": "Ultimate performance", "Économie d'énergie": "Power saver", "Personnalisé": "Custom" },
    },
    tempSource: {
      title: "Temperature followed by the curve",
      description: "Choose what drives fan 1 in Auto mode. The graphics card temperature is only read if the card is already awake: the application never wakes it, and when it sleeps the processor temperature applies. Fan 2 has its own source, set in its card on the Control page.",
      cpuTitle: "Processor only",
      cpuText: "Fan 1's curve follows the processor temperature only. This is the original behavior.",
      maxTitle: "The higher of processor or graphics card",
      maxText: "The curve follows the higher of the two temperatures. A game that heats the graphics card speeds up the fan even if the processor stays cool.",
    },
  },
}
