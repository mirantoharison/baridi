/** Textes de la page Logs. */
export const logs = {
  fr: {
    summary:
      "Ce journal liste <b>toutes les requêtes envoyées au contrôleur</b> depuis l'ouverture de l'application : changement de mode, vitesse manuelle, choix d'un profil, création ou suppression d'un profil, chargement de la liste des profils, ainsi que l'ouverture et la perte du flux de mesures en direct. Pour chaque ligne, tu vois l'heure précise à la milliseconde, la méthode et le chemin appelés, le corps envoyé le cas échéant, le code de réponse et le temps de réponse en millisecondes. Les lignes les plus récentes sont en haut. C'est l'outil à consulter quand le ventilateur ne réagit pas comme tu l'attendais : il permet de savoir si l'application a bien envoyé l'ordre, à quel moment, et si le contrôleur l'a accepté ou refusé.",
    details:
      "Les mesures reçues chaque seconde ne sont volontairement pas consignées, sinon elles noieraient les actions utiles en quelques minutes. De même, une perte de connexion n'est consignée qu'une seule fois, et non à chaque tentative de reconnexion. Le journal est stocké dans le <b>localStorage</b> de la fenêtre et plafonné à <b>{{max}} lignes</b> : au-delà, les plus anciennes sont supprimées une à une pour faire de la place aux nouvelles. Il est <b>entièrement effacé à la fermeture réelle</b> de l'application, c'est-à-dire avec « Quitter » dans le menu de la zone de notification, et jamais simplement quand tu réduis la fenêtre ou que tu cliques sur la croix. Si l'application s'est arrêtée brutalement, par exemple lors d'un plantage ou d'une extinction forcée, le journal de la session précédente est jeté au lancement suivant plutôt que mélangé à la nouvelle session. Un code accepté reste discret, une erreur renvoyée par le contrôleur apparaît en rose, et « ERR » signifie que la requête n'a même pas pu l'atteindre, parce que le contrôleur est arrêté ou pas encore démarré. La durée reste grise tant que le contrôleur répond en moins de 100 ms, puis passe à l'orange et au rose. Les lignes « SSE » signalent l'ouverture (OPEN) ou la perte (LOST) du flux de mesures. <b>Clique sur une ligne</b> pour en voir les détails : l'adresse complète, le corps envoyé et la réponse du contrôleur mis en forme (tronquée à 2000 caractères), avec de quoi copier la requête en commande curl ou la réponse. Le bouton « Vider » efface le journal immédiatement.",
    title: "Requêtes envoyées",
    clear: "Vider",
    empty: "Aucune requête pour l'instant.",
    hideDetails: "Masquer les détails",
    showDetails: "Afficher les détails de la requête",
    request: "Requête",
    response: "Réponse",
    code: "Code",
    duration: "Durée",
    time: "Heure",
    sseNoContent: "Flux de mesures en continu : le contenu n'est pas consigné (une mesure par seconde).",
    noContent: "Aucun contenu dans la réponse.",
    copied: "Copié",
    copyCurl: "Copier en curl",
    copyResponse: "Copier la réponse",
  },
  en: {
    summary:
      "This log lists <b>every request sent to the controller</b> since the application was opened: mode change, manual speed, choosing a profile, creating or deleting a profile, loading the profile list, as well as the opening and loss of the live measurement stream. For each line, you see the exact time to the millisecond, the method and path called, the body sent if any, the response code and the response time in milliseconds. The most recent lines are at the top. It is the tool to check when the fan does not react as you expected: it tells you whether the application did send the order, when, and whether the controller accepted or refused it.",
    details:
      "Measurements received every second are deliberately not logged, otherwise they would drown the useful actions within minutes. Likewise, a connection loss is logged only once, not at every reconnection attempt. The log is stored in the window's <b>localStorage</b> and capped at <b>{{max}} lines</b>: beyond that, the oldest are removed one by one to make room for new ones. It is <b>entirely cleared on a real close</b> of the application, that is with “Quit” in the notification area menu, and never simply when you minimize the window or click the cross. If the application stopped abruptly, for example in a crash or a forced shutdown, the previous session's log is thrown away at the next launch rather than mixed with the new session. An accepted code stays discreet, an error returned by the controller appears in pink, and “ERR” means the request could not even reach it, because the controller is stopped or not yet started. The duration stays gray as long as the controller answers in under 100 ms, then turns orange and pink. “SSE” lines report the opening (OPEN) or loss (LOST) of the measurement stream. <b>Click a line</b> to see its details: the full address, the body sent and the controller's response, formatted (truncated to 2000 characters), with a way to copy the request as a curl command or the response. The “Clear” button wipes the log immediately.",
    title: "Requests sent",
    clear: "Clear",
    empty: "No requests yet.",
    hideDetails: "Hide details",
    showDetails: "Show the request details",
    request: "Request",
    response: "Response",
    code: "Code",
    duration: "Duration",
    time: "Time",
    sseNoContent: "Continuous measurement stream: the content is not logged (one reading per second).",
    noContent: "No content in the response.",
    copied: "Copied",
    copyCurl: "Copy as curl",
    copyResponse: "Copy the response",
  },
}
