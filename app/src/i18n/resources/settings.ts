/** Textes de la page Réglages : passage de la puissance (Steep/Smooth) et réglages fins du mode Auto. */
export const settings = {
  fr: {
    summary:
      "Ces <b>préférences globales</b> concernent le contrôleur dans son ensemble et non un profil en particulier. Elles sont conservées dans un fichier <code>settings.json</code> placé à côté de l'exécutable du contrôleur, ce qui signifie qu'elles sont retrouvées telles quelles à chaque lancement, que le contrôleur soit démarré par l'application ou par Windows. Tu y règles la manière dont la température est convertie en vitesse de ventilateur. Le service Windows, les alertes et les raccourcis clavier ont leur propre section « Configuration » dans la barre latérale.",
    details:
      "Le mode de <b>passage de la puissance</b> s'applique à tous les profils, mais uniquement en mode Auto : en mode Manuel, la courbe n'est de toute façon pas utilisée. En <b>Steep</b>, la courbe fonctionne par paliers : chaque point fixe la vitesse tant que la température reste inférieure à sa valeur, puis la vitesse saute au palier suivant dès que ce seuil est franchi. En <b>Smooth</b>, la vitesse est calculée par interpolation linéaire entre deux points voisins, ce qui donne une montée progressive ; sous le premier point la vitesse de ce point est conservée, et au-dessus du dernier point c'est la vitesse du dernier point qui s'applique. Dans les deux cas, le contrôleur rejoint ensuite la cible par petites étapes pour éviter les variations brutales de bruit. Les petites illustrations schématisent la différence entre les deux modes à partir d'une courbe d'exemple ; clique sur une carte pour sélectionner son mode, le changement est appliqué tout de suite et mémorisé.",
    curveTitle: "Passage de la puissance",
    curveDescription:
      "Choisis la manière dont la température du processeur est convertie en vitesse de ventilateur lorsque le mode Auto est actif. Le réglage est global : il vaut pour tous les profils, système comme custom, et il est enregistré dans <code>settings.json</code> pour les prochains lancements, que le contrôleur soit démarré par l'application ou par Windows. Il n'a aucun effet en mode Manuel, où la courbe n'est pas utilisée. Les courbes ci-dessous sont un exemple théorique destiné à illustrer la différence ; tes propres profils gardent leurs points, seule la façon de les lire change.",
    steep:
      "La vitesse saute d'un palier à l'autre : chaque point de la courbe fixe la vitesse tant que la température reste sous sa valeur, puis le ventilateur passe d'un coup au palier suivant dès que ce seuil est franchi (le contrôleur lisse tout de même le passage en quelques dixièmes de seconde). Le comportement est très lisible et prévisible : à une température donnée correspond toujours une vitesse bien identifiable sur la courbe, ce qui facilite les réglages fins. En contrepartie, on peut entendre un changement de régime à chaque seuil franchi, surtout quand la température oscille autour de l'un d'eux.",
    smooth:
      "La vitesse évolue progressivement : elle est interpolée linéairement entre deux points voisins de la courbe, si bien que chaque degré de plus ou de moins se traduit par un petit ajustement de la vitesse, sans jamais de marche brusque. Sous le premier point, c'est la vitesse de ce point qui est conservée, et au-dessus du dernier point celle du dernier point. Les changements de régime sont plus discrets et le ventilateur reste plus stable, ce qui est souvent plus agréable à l'oreille sur une machine dont la température fluctue beaucoup, au prix d'une courbe un peu moins directe à lire : la vitesse réelle se situe entre deux points, pas sur un palier.",
    tuning: {
      title: "Réglages fins du mode Auto",
      description:
        "Ces réglages s'appliquent à <b>tous les profils</b> et uniquement en mode Auto. L'<b>hystérésis</b> évite que le ventilateur « pompe » quand la température oscille autour d'un seuil : une baisse de vitesse n'est appliquée qu'une fois la température redescendue du nombre de degrés choisi sous celle du dernier changement. Le <b>filtre anti-pic</b> fait réagir le contrôleur à la moyenne des dernières secondes plutôt qu'à chaque mesure, pour ignorer un pic bref. Les <b>montées de vitesse restent immédiates</b> et le filtre est ignoré dès 90° : refroidir passe avant le silence. Un changement de profil ou de mode de courbe s'applique tout de suite. Le <b>lissage</b> règle la vitesse à laquelle le ventilateur rejoint sa nouvelle consigne.",
      hysteresis: "Hystérésis",
      hysteresisOff: "Désactivée : le ventilateur ralentit dès que la courbe le demande.",
      hysteresisOn: "Ralentit après une baisse de {{value}}° sous le dernier changement.",
      filter: "Filtre anti-pic",
      filterOff: "Désactivé : chaque mesure de température compte.",
      filterOn: "Moyenne glissante sur les {{value}} dernières secondes.",
      smoothing: "Lissage des transitions",
      smoothingOptions: {
        fast: { title: "Réactif", text: "Le ventilateur change de vitesse deux fois plus vite. Il suit la température de près, au prix de variations de bruit plus audibles." },
        normal: { title: "Normal", text: "Le rythme défini par le profil actif, sans modification." },
        slow: { title: "Doux", text: "Les changements de vitesse sont trois fois plus lents : montées et descentes très progressives, presque inaudibles." },
      },
    },
  },
  en: {
    summary:
      "These <b>global preferences</b> concern the controller as a whole and not a particular profile. They are kept in a <code>settings.json</code> file next to the controller's executable, which means they are found unchanged at every launch, whether the controller is started by the application or by Windows. Here you set how the temperature is converted into fan speed. The Windows service, alerts and keyboard shortcuts have their own “Configuration” section in the sidebar.",
    details:
      "The <b>speed transition</b> mode applies to all profiles, but only in Auto mode: in Manual mode the curve is not used anyway. In <b>Steep</b>, the curve works in steps: each point sets the speed as long as the temperature stays below its value, then the speed jumps to the next step as soon as that threshold is crossed. In <b>Smooth</b>, the speed is computed by linear interpolation between two neighboring points, which gives a gradual rise; below the first point the speed of that point is kept, and above the last point the last point's speed applies. In both cases, the controller then reaches the target in small steps to avoid abrupt noise variations. The small illustrations sketch the difference between the two modes from an example curve; click a card to select its mode, the change is applied immediately and remembered.",
    curveTitle: "Speed transition",
    curveDescription:
      "Choose how the processor temperature is converted into fan speed when Auto mode is active. The setting is global: it applies to all profiles, system and custom alike, and is saved in <code>settings.json</code> for the next launches, whether the controller is started by the application or by Windows. It has no effect in Manual mode, where the curve is not used. The curves below are a theoretical example meant to illustrate the difference; your own profiles keep their points, only the way they are read changes.",
    steep:
      "The speed jumps from one step to the next: each point of the curve sets the speed as long as the temperature stays below its value, then the fan goes to the next step at once as soon as that threshold is crossed (the controller still smooths the transition over a few tenths of a second). The behavior is very readable and predictable: a given temperature always corresponds to a clearly identifiable speed on the curve, which makes fine tuning easier. In return, you may hear a change of speed at each threshold crossed, especially when the temperature oscillates around one of them.",
    smooth:
      "The speed changes gradually: it is linearly interpolated between two neighboring points of the curve, so each degree more or less results in a small speed adjustment, never an abrupt step. Below the first point, that point's speed is kept, and above the last point the last point's speed. Speed changes are more discreet and the fan stays steadier, which is often more pleasant to the ear on a machine whose temperature fluctuates a lot, at the cost of a curve that is a little less direct to read: the real speed lies between two points, not on a step.",
    tuning: {
      title: "Fine settings for Auto mode",
      description:
        "These settings apply to <b>all profiles</b> and only in Auto mode. <b>Hysteresis</b> prevents the fan from “hunting” when the temperature oscillates around a threshold: a speed decrease is only applied once the temperature has dropped by the chosen number of degrees below that of the last change. The <b>spike filter</b> makes the controller react to the average of the last few seconds rather than to every reading, to ignore a brief spike. <b>Speed increases stay immediate</b> and the filter is bypassed from 90°: cooling comes before silence. A change of profile or curve mode applies immediately. <b>Smoothing</b> sets how fast the fan reaches its new setpoint.",
      hysteresis: "Hysteresis",
      hysteresisOff: "Off: the fan slows down as soon as the curve asks for it.",
      hysteresisOn: "Slows down after a drop of {{value}}° below the last change.",
      filter: "Spike filter",
      filterOff: "Off: every temperature reading counts.",
      filterOn: "Moving average over the last {{value}} seconds.",
      smoothing: "Transition smoothing",
      smoothingOptions: {
        fast: { title: "Responsive", text: "The fan changes speed twice as fast. It follows the temperature closely, at the cost of more audible noise variations." },
        normal: { title: "Normal", text: "The pace defined by the active profile, unchanged." },
        slow: { title: "Gentle", text: "Speed changes are three times slower: very gradual rises and falls, almost inaudible." },
      },
    },
  },
}
