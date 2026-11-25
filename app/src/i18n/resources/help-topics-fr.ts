/**
 * Explications détaillées de la page Aide (français). Les paragraphes sont séparés par une ligne vide ; la page les affiche
 * chacun dans son propre bloc.
 */
export const topicsFr = {
  curve: {
    title: "La courbe de ventilation",
    body: `Chaque profil contient une courbe : une liste de points qui associent une température du processeur (en °C) à une vitesse de ventilateur (en %). Quand le mode Auto est actif, le contrôleur lit la température environ toutes les deux secondes, cherche où elle se place sur la courbe et en déduit la vitesse demandée. En mode Manuel, la courbe n'est pas utilisée : la vitesse que tu fixes l'emporte.

La forme de la courbe est un compromis entre le bruit et la température. Une courbe qui monte tôt et vite garde la machine fraîche mais fait tourner le ventilateur dès les petites charges. Une courbe qui reste basse longtemps est silencieuse, mais laisse la température monter davantage avant de réagir. Les profils fournis (silencieux, équilibré, performance, etc.) sont des points de départ : tu peux en créer d'autres dans la page Profils en déplaçant les points à la souris.

La manière dont la vitesse passe d'un point à l'autre dépend du mode de courbe choisi dans Réglages (net ou doux, voir plus bas). Dans tous les cas, le contrôleur n'applique pas la nouvelle vitesse d'un seul coup : il s'en approche par petits pas, pour éviter les variations brusques de bruit.

Pour juger si une courbe te convient, regarde la page Info ou le mini-widget pendant une charge habituelle (un jeu, une compilation) : si la température se stabilise sous 80 °C sans que le ventilateur soit trop bruyant, la courbe est bonne. Si elle dépasse souvent 85 °C, monte les points du haut ; si le ventilateur s'emballe pour rien, abaisse ceux du bas ou augmente l'hystérésis.`,
  },
  hysteresis: {
    title: "Hystérésis, filtre et lissage",
    body: `Ces trois réglages, dans Réglages > Ventilation, servent tous à rendre le ventilateur plus calme sans changer la courbe elle-même. Ils s'appliquent à tous les profils et seulement en mode Auto.

L'hystérésis (de 0 à 10 °C) est la marge dont la température doit redescendre avant que le ventilateur ralentisse. Sans elle, une température qui oscille d'un degré autour d'un seuil ferait monter et descendre la vitesse sans arrêt, ce qui est très audible. Avec 3 °C, par exemple, si la courbe a demandé 60 % à 70 °C, le ventilateur ne repasse sous 60 % qu'une fois la température redescendue d'environ 3 degrés. L'accélération, elle, reste immédiate : on ne retarde jamais une montée en vitesse, seulement la descente.

Le filtre de température (de 0 à 20 secondes, par pas de 2) fait la moyenne des relevés récents avant de les comparer à la courbe. Il écarte les pics très courts : un processeur qui grimpe de 15 degrés pendant une seconde à l'ouverture d'un programme n'emballera plus le ventilateur. Comme le contrôleur relève la température toutes les deux secondes, une fenêtre n'a de sens que par multiples de 2. Une valeur trop grande retarde la réaction à une vraie montée en chaleur ; au-delà de 20 secondes elle serait dangereuse, c'est pourquoi la limite existe.

Le lissage (rapide, normal ou lent) règle la rapidité avec laquelle la vitesse réelle rejoint la vitesse cible. Rapide réagit presque tout de suite ; lent étale le changement sur plusieurs secondes, ce qui supprime les à-coups sonores.

Pour un ventilateur discret au quotidien, essaie 2 à 3 °C d'hystérésis, un filtre de 4 à 6 secondes et un lissage normal. Pour du jeu intensif où la réactivité compte, mets l'hystérésis à 1 °C, un filtre court ou nul et un lissage rapide.`,
  },
  curveMode: {
    title: "Courbe nette ou douce",
    body: `Le mode de courbe, dans Réglages > Ventilation, décide de la façon dont la vitesse est lue sur la courbe entre deux points. Il vaut pour tous les profils.

En mode net (Steep), la courbe fonctionne par paliers : chaque point fixe la vitesse tant que la température reste en dessous de sa valeur, puis la vitesse saute au palier suivant dès que ce seuil est franchi. C'est très lisible et prévisible : une température donnée correspond toujours à une vitesse bien identifiable sur la courbe, ce qui facilite le réglage fin. En contrepartie, on peut entendre un changement de régime à chaque seuil franchi, surtout quand la température oscille autour de l'un d'eux.

En mode doux (Smooth), la vitesse est interpolée linéairement entre les deux points voisins : chaque degré de plus se traduit par un petit ajustement, sans marche brusque. Sous le premier point, la vitesse de ce point est conservée ; au-dessus du dernier, c'est la vitesse du dernier point qui s'applique. Les changements de régime sont plus discrets et le ventilateur reste plus stable, ce qui est souvent plus agréable sur une machine dont la température fluctue beaucoup.

Dans les deux cas, le contrôleur rejoint ensuite la cible par petits pas. Si tu hésites, commence par le mode doux : c'est le plus confortable à l'oreille. Choisis le mode net si tu veux que chaque palier soit exactement celui que tu as dessiné.`,
  },
  fan2: {
    title: "Le second ventilateur",
    body: `Certains modèles ont deux ventilateurs : l'un souffle surtout sur le processeur, l'autre sur la carte graphique. L'application ne montre le second que si la machine l'annonce et qu'elle l'a vu tourner. Sa carte est dans la page Pilotage.

Il a quatre modes. Firmware : la carte mère le pilote seule, c'est le comportement d'origine. Suivre : il reçoit la même consigne que le ventilateur 1. Manuel : tu fixes sa vitesse en pourcentage. Courbe : il suit sa propre courbe, indépendante de celle du profil.

La courbe du ventilateur 2 se bâtit sur une source de température au choix : le processeur, la carte graphique, ou la plus haute des deux. C'est le réglage le plus utile pour un portable de jeu : tu peux faire souffler le ventilateur 2 selon la carte graphique tout en laissant le ventilateur 1 suivre le processeur. Un clic sur « Courbe » applique tout de suite la dernière courbe enregistrée ; le bouton « Appliquer » ne devient actif qu'après une modification, pour la sauvegarder et l'appliquer.

Attention à la vitesse réelle : la consigne que tu envoies n'est pas forcément suivie par le matériel, c'est pourquoi seule la vitesse mesurée en tours par minute fait foi. Si le ventilateur ne tourne pas alors qu'une consigne lui est demandée, une alerte de ventilateur bloqué peut te prévenir (voir la page Alertes).

La sauvegarde des réglages n'inclut pas le mode du ventilateur 2, volontairement : le rétablir changerait le pilotage du matériel sans que tu l'aies demandé.`,
  },
  bios: {
    title: "Le mode BIOS",
    body: `Le mode BIOS décrit une situation où c'est le firmware de la machine, et non Baridi, qui pilote les ventilateurs. Dans cet état, la courbe de ton profil est ignorée : la vitesse que tu vois n'est pas celle que le contrôleur a demandée.

Cela arrive après avoir commandé le ventilateur 2 puis rendu la main au firmware. La DLL du constructeur utilise un mode test pour prendre le contrôle des ventilateurs ; quand on revient au mode firmware, elle coupe ce mode test pour les deux ventilateurs à la fois, y compris le ventilateur 1 que tu pilotais. La carte mère reprend alors les deux, avec ses propres courbes, généralement plus conservatrices.

L'application l'indique de deux façons. Sur la carte du ventilateur, la puissance n'est plus affichée (la remplacer par une consigne qui n'est pas suivie serait trompeur) et un message précise que la machine est en mode BIOS. Le contrôleur remonte aussi cette information dans l'état qu'il publie.

Pour reprendre la main, il suffit de relancer le mode Auto, de choisir un profil ou de fixer une vitesse manuelle : le contrôleur réécrit alors la consigne du ventilateur 1 et reprend le pilotage. Si tu veux laisser volontairement le second ventilateur au firmware, ce n'est pas un problème en soi : seul le ventilateur 1 doit rester piloté par le contrôleur.`,
  },
  tempSource: {
    title: "La température de référence",
    body: `La courbe du ventilateur 1 a besoin d'une température pour fonctionner. Par défaut, c'est celle du processeur, qui est la seule fournie par le firmware. Dans Réglages > Ventilation, tu peux choisir « la plus haute : processeur ou carte graphique ».

Dans ce second mode, le contrôleur compare les deux températures à chaque relevé et utilise la plus élevée. L'intérêt apparaît dans les situations où la carte graphique chauffe sans que le processeur soit sollicité : un jeu bien optimisé côté processeur, un rendu 3D, un calcul sur la carte. Avec la source « processeur seul », le ventilateur resterait lent alors que la carte monte en température ; avec « la plus haute », il accélère pour la refroidir aussi.

IMPORTANT : l'application ne réveille jamais la carte pour la mesurer. Si la carte dort (voir « Carte graphique endormie »), sa température est simplement ignorée et c'est celle du processeur qui s'applique. Ce choix évite de faire monter la consommation et de vider la batterie pour une mesure inutile.

Ce réglage ne concerne que le ventilateur 1. Le ventilateur 2 a sa propre source dans sa carte, au choix entre processeur, carte graphique ou la plus haute.`,
  },
  throttle: {
    title: "Limitation (throttling)",
    body: `Quand une puce chauffe trop, atteint sa limite de puissance ou manque d'énergie, elle réduit seule sa fréquence pour se protéger. On appelle cela la limitation, ou throttling. La machine ne plante pas, mais elle devient nettement plus lente, parfois pendant plusieurs minutes.

Pour le processeur, l'application ne peut pas lire directement l'état de limitation : elle le déduit. Quand la fréquence mesurée est très inférieure à la fréquence de base alors que le processeur est fortement chargé, elle affiche « limitation probable ». C'est une déduction, pas une lecture exacte : un processeur en économie d'énergie peut aussi baisser sa fréquence sans être en difficulté, d'où la condition de forte charge.

Pour la carte graphique, le pilote NVIDIA donne les raisons. « Protection thermique matérielle » est la vraie protection de la puce : elle signifie qu'elle est trop chaude. « Plafond thermique de plateforme » est déclaré en permanence par la plupart des portables, même à 50 °C : l'application ne le compte pas comme une limitation. « Limite de puissance » indique que la carte a atteint le plafond d'énergie permis (courant avec un chargeur trop faible ou sur batterie), et « ralentissement matériel » regroupe les autres causes.

L'historique garde la trace des épisodes de limitation (leur nombre et leur durée cumulée) et les affiche dans le résumé des 24 heures et dans le rapport. Si tu en vois régulièrement, c'est le signe d'un refroidissement insuffisant : nettoie les grilles et les ventilateurs, vérifie la page Historique pour l'encrassement, et envisage une courbe plus agressive.`,
  },
  power: {
    title: "PL1, PL2 et plan d'alimentation",
    body: `Le processeur d'un portable est bridé par deux limites de puissance. PL1 est la puissance qu'il peut tenir en continu sans surchauffer ; PL2 est la puissance plus élevée qu'il peut atteindre brièvement, par exemple au lancement d'un programme lourd, avant de redescendre vers PL1. Ce sont ces limites, plus que la température, qui déterminent la vitesse d'un processeur sous charge prolongée.

L'application lit ces deux valeurs dans la DLL du constructeur, en lecture seule. Elles sont affichées telles que la machine les donne, sans unité fiable : ne les interprète pas en watts. Une valeur manifestement absurde est écartée. Pour la puissance et la tension du processeur, l'unité n'est pas documentée non plus : ce sont des valeurs brutes, utiles pour suivre une tendance.

Le plan d'alimentation de Windows est un autre levier, plus simple. Les plans standard (économie d'énergie, équilibré, performances élevées) changent la fréquence maximale que Windows autorise, la manière dont le processeur monte en régime et le niveau de veille des composants. L'application peut lire et changer le plan actif dans la page Énergie et batterie ; le plan « Performances maximales », souvent masqué par Windows, n'est proposé que s'il est installé.

L'automatisation peut aussi choisir le plan pour toi : par exemple passer en économie d'énergie dès que la machine est sur batterie, et revenir à équilibré une fois branchée.`,
  },
  gpuSleep: {
    title: "Carte graphique endormie",
    body: `Sur un portable hybride (technologie Optimus), la carte NVIDIA s'éteint complètement quand personne ne s'en sert : l'écran passe par la puce graphique intégrée au processeur. Windows décrit son état par un code : D0 (allumée) ou D3 (veille profonde). C'est ce qui permet une autonomie correcte, car une carte allumée consomme plusieurs watts même au repos.

Le piège est qu'interroger la carte la réveille. Si l'application la mesurait chaque seconde, elle l'empêcherait de dormir, ferait monter la consommation de la batterie et chaufferait inutilement la machine. C'est pourquoi Baridi vérifie d'abord l'état d'alimentation de la carte : si elle dort, il ne la mesure pas, n'affiche aucune valeur à sa place et le dit clairement (page Carte graphique et carte du matériel dans Info).

Dès qu'un programme utilise la carte, Windows la réveille et les mesures reprennent d'elles-mêmes : température, charge, mémoire, fréquences, puissance et programmes qui l'utilisent. Les alertes de température de la carte et la source de température « la plus haute » ne se déclenchent que dans ces moments-là.

Dans l'historique, la période où la carte dormait apparaît comme un trou dans les courbes de la carte, pas comme une valeur à zéro : c'est normal et voulu.

Le mode graphique est déduit des cartes présentes : hybride (Optimus), dédié (carte NVIDIA seule) ou intégré. Seul le mode hybride a ce comportement de veille.`,
  },
  history: {
    title: "Historique, rapports et encrassement",
    body: `Le contrôleur tourne en permanence, même quand la fenêtre est fermée. Toutes les 30 secondes, il note dans un fichier (history.jsonl, à côté de son exécutable) la température du processeur, la consigne et la vitesse des ventilateurs, et quand ils sont disponibles la charge du processeur, la carte graphique, la batterie, la puissance échangée et les épisodes de limitation. Il garde 14 jours, soit environ 40 000 lignes (quelques mégaoctets). Une coupure de courant ne peut abîmer que la dernière ligne.

La charge du processeur et les mesures de la carte graphique ne sont notées que lorsque l'interface a mesuré récemment : les mesurer en arrière-plan empêcherait la carte de dormir. Elles manquent donc quand l'interface était fermée. La température et les ventilateurs, eux, sont toujours là.

La page Historique montre les courbes, le résumé des 24 dernières heures et des conseils. La page Rapports calcule les chiffres clés sur 7 ou 14 jours (moyenne, maximum, temps passé au-dessus de 70 et 80 °C, énergie tirée de la batterie, etc.) et exporte les mesures en CSV pour Excel.

Le diagnostic d'encrassement compare, au fil des jours, la vitesse nécessaire pour une même température. Si le ventilateur doit tourner de plus en plus vite pour obtenir le même refroidissement, c'est probablement de la poussière dans le radiateur ou les grilles. Il faut environ quatre heures de mesures avant de se prononcer. Les résultats sont : pas assez de recul, aucune dérive, légère baisse à surveiller, ou nette baisse avec conseil de nettoyage.

Pour la santé de la batterie, le contrôleur note en plus un relevé par jour (usure, capacité, cycles) dans battery_health.jsonl, sans limite de durée : la tendance apparaît dans la page Énergie et batterie après deux jours.`,
  },
  automation: {
    title: "Automatisation",
    body: `L'automatisation applique un profil de ventilation, et éventuellement un plan d'alimentation, selon le contexte, sans que tu aies à y penser. Elle se règle dans la page Automatisation et s'active globalement avec un interrupteur.

Chaque règle a un déclencheur, une valeur et une action. Il y en a quatre : « programme lancé » (par exemple un jeu ; tu choisis l'application dans une liste avec icônes et recherche), « source d'alimentation » (secteur ou batterie), « plan d'alimentation Windows » (quand tel plan est actif) et « batterie sous un niveau » (par exemple moins de 20 %). L'action est un profil, avec en option un plan d'alimentation à imposer.

Les règles sont examinées dans l'ordre de la liste, qui est donc leur priorité : la première dont la condition est vraie l'emporte. Le moteur vérifie le contexte toutes les cinq secondes. Quand plus aucune règle ne s'applique, le profil d'origine et le plan d'origine sont restaurés.

Exemples utiles : profil performance quand un jeu tourne ; profil silencieux et plan économie d'énergie sur batterie ; profil silencieux quand la batterie passe sous 20 %. Mets les règles les plus spécifiques en haut (le jeu avant la source d'alimentation), sinon une règle générale masquera les autres.

Chaque règle peut être activée, modifiée, enregistrée ou annulée séparément. Les règles font partie de la sauvegarde exportée depuis la page Sauvegarde.`,
  },
  widget: {
    title: "Mini-widget",
    body: `Le mini-widget est une petite fenêtre sans bordure, toujours au-dessus des autres, qui affiche en direct ce qui compte le plus : une courbe de la température et des deux vitesses de ventilateur, et quatre cartes pour les indicateurs principaux. Il suit le thème clair ou sombre de l'application.

Il se règle dans Réglages > Mini-widget. L'interrupteur l'affiche ou le masque ; l'opacité au repos (30, 55 ou 80 %) fixe son niveau de transparence tant que tu ne le survoles pas. Dès que la souris passe dessus, il redevient net, ce qui permet de le laisser en permanence sur un coin d'écran sans gêner. Tu peux le déplacer en le faisant glisser, et sa position est mémorisée d'un lancement à l'autre.

Le clic traversant (« click-through ») fait ignorer la souris par le widget : tes clics passent à la fenêtre qui est dessous, ce qui est idéal en plein jeu. Attention, il ne peut alors plus être déplacé, fermé ni survolé. Pour le rendre de nouveau cliquable, utilise l'interrupteur dans Réglages ou le raccourci clavier Ctrl+Shift+F6.

Le raccourci Ctrl+Shift+F5 affiche ou masque le widget d'un seul geste, sans ouvrir l'application. Les raccourcis doivent être activés dans la page Raccourcis, et leurs combinaisons peuvent y être modifiées ; si Windows en refuse une, la page Logs l'indique.`,
  },
}
