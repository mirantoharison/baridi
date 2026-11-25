/** Deutsch, Teil 2/3: Steuerung, Profile, Einstellungen. */
export const deB = {
  control: {
    confirm: { cancel: "Abbrechen", continueAnyway: "Trotzdem fortfahren" },
    guards: {
      manual: "Der Prozessor hat {{temp}}° und die angeforderte Drehzahl beträgt {{percent}} %. Unter {{min}} % könnte er sich weiter erhitzen: Nichts regelt die Drehzahl, solange du im manuellen Modus bleibst.",
      stop: "Der Prozessor hat {{temp}}°. Im Aus-Modus behält der Lüfter seine letzte Drehzahl und passt sich nicht mehr an die Temperatur an: Steigt sie, beschleunigt nichts den Lüfter.",
      lowSpeedTitle: "Niedrige manuelle Drehzahl",
      stopTitle: "Automatische Steuerung stoppen?",
    },
    card: {
      title: "Steuerung",
      modes: { auto: "Auto", manual: "Manuell", idle: "Aus" },
      manualSpeed: "Manuelle Drehzahl",
      autoText:
        "Der Auto-Modus ist aktiv: Alle 2 Sekunden liest der Controller die Prozessortemperatur, ermittelt die von der Kurve des aktiven Profils vorgesehene Drehzahl und führt den Lüfter schrittweise dorthin, in kleinen Schritten, um abrupte Drehzahlwechsel zu vermeiden. Hier gibt es nichts einzustellen: Wechsle einfach unten das aktive Profil, wenn du ein leiseres oder kühlenderes Verhalten möchtest. Wähle Manuell, wenn du die Drehzahl selbst festlegen willst, etwa für einen Lärmtest oder um vor einer schweren Aufgabe maximal zu kühlen; der Regler erscheint dann an dieser Stelle.",
      idleText:
        "Die automatische Steuerung ist gestoppt: Der Controller liest die Temperatur nicht mehr, um die Drehzahl anzupassen, und der Lüfter bleibt bis zu deiner nächsten Wahl auf der zuletzt angewendeten Drehzahl, ohne dass das ursprüngliche Verhalten des Geräts wieder übernimmt. Behalte die Temperatur im Reiter Info im Auge, denn nichts senkt sie, bis du den Auto-Modus wieder startest oder im manuellen Modus eine Drehzahl festlegst. Wenn du den Computer unbeaufsichtigt lässt, wechsle zurück zu Auto: Das ist der sicherste Modus, weil sich die Drehzahl dann jederzeit der Temperatur anpasst.",
    },
    tab: {
      summary:
        "Dieser Reiter dient dazu, den <b>Lüfter live zu steuern</b>. Du wählst den <b>Betriebsmodus</b> (Auto, Manuell oder Aus), legst die Drehzahl von Hand fest, wenn du übernehmen willst, und wählst das <b>aktive Profil</b>, dessen Kurve im Auto-Modus die Drehzahl bestimmt. Die unten angezeigte Kurve zeigt genau, was der Controller anwendet, mit einer senkrechten Markierung, die der Prozessortemperatur in Echtzeit folgt: So siehst du jederzeit, wo du auf der Kurve stehst und welche Drehzahl sich ergibt. Alle Aktionen dieses Reiters werden sofort an den Controller gesendet und im Reiter Protokolle festgehalten, sodass sich nachträglich prüfen lässt, was wann angefordert wurde.",
      details:
        "Im <b>Auto</b>-Modus liest der Controller alle 2 Sekunden die Temperatur, berechnet die Zieldrehzahl aus der Kurve des aktiven Profils und erreicht dieses Ziel in aufeinanderfolgenden kleinen Schritten statt auf einmal (standardmäßig 5 PWM-Einheiten alle 50 Millisekunden), was Lärmspitzen vermeidet; der Übergang startet nur neu, wenn sich das Ziel wirklich geändert hat. Der Controller startet immer in Auto, mit dem zuletzt verwendeten Profil, auch wenn er als Dienst gestartet wird, bevor du die Anwendung öffnest. Im <b>Manuell</b>-Modus ist die automatische Steuerung aus und die gewählte Drehzahl (in 5-%-Schritten, mit Voreinstellungen bei 25, 50, 75 und 100 %) wird unabhängig von der Temperatur unverändert angewendet: Behalte sie im Reiter Info im Auge. Der Wert wird erst einen Sekundenbruchteil nach dem Loslassen des Reglers gesendet, damit der Controller beim Ziehen nicht mit Anfragen überflutet wird. Im <b>Aus</b>-Modus wird die automatische Steuerung lediglich ausgesetzt und die aktuelle Drehzahl beibehalten, ohne Rückkehr zum ursprünglichen Verhalten des Geräts: Nichts senkt die Temperatur, bis du den Auto-Modus wieder startest. Ein Wechsel des aktiven Profils wirkt bei der nächsten Messung im Auto-Modus, spätestens 2 Sekunden später, und wird für den nächsten Start gespeichert. Geht der Computer in den Ruhezustand, setzt der Controller die automatische Steuerung aus und nimmt sie beim Aufwachen wieder auf. Beim Schließen der Anwendung oder beim Herunterfahren von Windows setzt er den Lüfter auf das Profil Balanced zurück, bevor er sich beendet, damit das Gerät nie auf einer festen Drehzahl bleibt. Läuft der Controller als Windows-Dienst, beendet das Schließen der Anwendung ihn nicht: Die Steuerung läuft weiter.",
      activeProfile: "Aktives Profil",
      chooseProfile: "Profil wählen",
      custom: "Benutzerdefiniert",
      noProfile: "Kein Profil ausgewählt.",
    },
    fan2: {
      title: "Lüfter 2",
      modes: { firmware: "BIOS", follow: "Lüfter 1 folgen", manual: "Manuell", curve: "Kurve" },
      descriptions: {
        firmware:
          "Das BIOS des Mainboards steuert diesen Lüfter. Beim Start ist das der Standardmodus und er hat keinen Einfluss auf Lüfter 1. Kehrt man nach „Lüfter 1 folgen“ oder „Manuell“ dorthin zurück, wird jedoch der Testmodus der DLL beendet, wodurch AUCH Lüfter 1 ans BIOS zurückgegeben wird: Die Kurve deines Profils wird ignoriert, solange dieser Modus aktiv bleibt. Das BIOS hält das Gerät kühl, folgt aber nicht mehr deinen Einstellungen.",
        follow:
          "Dieser Lüfter erhält denselben Sollwert wie Lüfter 1: Er folgt also der Kurve des aktiven Profils, einschließlich Glättung und Hysterese. Der Sollwert wird in Schritten von etwa 4 % neu geschrieben, um den Drehzahlanstieg nicht zu bremsen.",
        manual:
          "Du legst die Drehzahl dieses Lüfters selbst fest. Sie wird unabhängig von der Prozessortemperatur gehalten, außer über 85°, wo er von selbst in den Modus „Lüfter 1 folgen“ zurückkehrt. Diese Wahl wird nie gespeichert: Beim nächsten Start wird er wieder von der Firmware gesteuert.",
        curve:
          "Dieser Lüfter hat seine eigene, vom Profil unabhängige Kurve, die sich an einer Temperatur deiner Wahl orientiert. Bei diesem Laptop ist es der Lüfter der Grafikkarte: Orientiert man ihn an der GPU, beschleunigt er, wenn ein Spiel sie fordert, auch wenn der Prozessor kühl bleibt. Die Temperatur der Karte wird nur gelesen, wenn sie bereits wach ist: Die Anwendung weckt sie nie und greift auf die des Prozessors zurück, wenn sie schläft. Über 85° (Prozessor) kehrt er zu „Lüfter 1 folgen“ zurück. Diese Kurve wird gespeichert.",
      },
      sources: { cpu: "Prozessortemperatur", gpu: "Grafikkartentemperatur", max: "Die höhere der beiden" },
      manualSpeed: "Manuelle Drehzahl",
      basedOn: "Orientiert an",
      applyCurve: "Kurve anwenden",
      biosOverride: "Das BIOS steuert derzeit <b>beide</b> Lüfter: Die Kurve deines Profils wird ignoriert, auch wenn die Seite Steuerung „Auto“ anzeigt. Wähle „Lüfter 1 folgen“ oder „Manuell“, um sie zurückzubekommen.",
      biosConfirmTitle: "In den BIOS-Modus wechseln?",
      biosConfirmMessage: "Das BIOS steuert beide Lüfter, einschließlich Lüfter 1: Die Kurve deines Profils wird ignoriert, solange du in diesem Modus bleibst. Um sie zurückzubekommen, wähle „Lüfter 1 folgen“ oder „Manuell“.",
      biosConfirmLabel: "Zu BIOS wechseln",
    },
    powerPlan: {
      title: "Windows-Energiesparplan",
      description: "Der Windows-Plan regelt die maximale Prozessorleistung und den Ruhezustand, zusätzlich zu deinem Lüfterprofil. Die Änderung gilt für den gesamten Computer.",
      customActive: " Ein benutzerdefinierter Plan ist aktiv: Die Wahl eines Standardplans ersetzt ihn.",
      currently: "Derzeit: {{plan}}",
      plans: { "Équilibré": "Ausbalanciert", "Performances élevées": "Höchstleistung", "Performances maximales": "Maximale Leistung", "Économie d'énergie": "Energiesparmodus", "Personnalisé": "Benutzerdefiniert" },
    },
    tempSource: {
      title: "Von der Kurve verfolgte Temperatur",
      description: "Wähle, was Lüfter 1 im Auto-Modus steuert. Die Grafikkartentemperatur wird nur gelesen, wenn die Karte bereits wach ist: Die Anwendung weckt sie nie, und wenn sie schläft, gilt die Prozessortemperatur. Lüfter 2 hat eine eigene Quelle, die in seiner Karte auf der Seite Steuerung eingestellt wird.",
      cpuTitle: "Nur der Prozessor",
      cpuText: "Die Kurve von Lüfter 1 folgt nur der Prozessortemperatur. Das ist das ursprüngliche Verhalten.",
      maxTitle: "Die höhere: Prozessor oder Grafikkarte",
      maxText: "Die Kurve folgt der höheren der beiden Temperaturen. Ein Spiel, das die Grafikkarte erhitzt, beschleunigt den Lüfter, auch wenn der Prozessor kühl bleibt.",
    },
  },
  profiles: {
    summary:
      "Dieser Reiter bündelt <b>alle deine Profile an einem Ort</b>. Die obere Liste zeigt die <b>System</b>profile (mit einem Schloss gesperrt: Sie werden mit der Anwendung geliefert und lassen sich weder ändern noch löschen) sowie deine <b>benutzerdefinierten</b> Profile, die du frei erstellen, ändern und löschen kannst; sie zeigt vier Profile gleichzeitig und scrollt darüber hinaus. Jede Zeile zeigt das Symbol des Profils, seinen Namen, seine Beschreibung und eine Vorschau seiner Kurve, und ein grüner Haken markiert das aktive. Klicke auf eine Zeile, um darunter die detaillierte Kurve des gewählten Profils mit der aktuellen Temperatur als Markierung sowie die möglichen Aktionen anzuzeigen: das Profil aktivieren, duplizieren und, bei einem benutzerdefinierten Profil, ändern oder löschen.",
    details:
      "Ein Profil ist eine Kurve, die einer Temperatur eine Lüfterdrehzahl zuordnet, mit einem Namen, einer optionalen Beschreibung und einem Symbol aus zehn (Flamme, Kälte, Blitz, Wind, Anzeige, Thermometer, leise, Prozessor, Öko und Turbo), das dir hilft, es in den Listen wiederzuerkennen. Drei Systemprofile werden mitgeliefert: <b>Silent</b>, das Ruhe bevorzugt und erst hochdreht, wenn sich das Gerät wirklich erhitzt; <b>Balanced</b>, ein Kompromiss zwischen Lärm und Kühlung; und <b>Turbo</b>, das schon ab den ersten Graden aggressiv kühlt. Benutzerdefinierte Profile speichert der Controller in einer Datei <code>profiles.json</code> neben seiner ausführbaren Datei: Du kannst sie sichern, auf ein anderes Gerät kopieren oder von Hand bearbeiten, solange du gültiges JSON beibehältst. Beim Speichern werden die Punkte nach Temperatur sortiert und jede Drehzahl auf 0 bis 100 % begrenzt, was auch immer du eingegeben hast. Die Schaltfläche <b>Duplizieren</b> öffnet das Erstellungsformular, vorausgefüllt mit der Kurve des gewählten Profils und dem Namen gefolgt von „(Kopie)“: So startest du am einfachsten von einer guten Basis, auch von einem Systemprofil aus. <b>Aktivieren</b> wendet das Profil sofort an und merkt es sich für den nächsten Start. Das Ändern des aktiven Profils aktualisiert seine Kurve beim Speichern. Das Löschen des aktiven Profils ändert die verwendete Kurve nicht, bis ein anderes Profil gewählt wird, aber es verschwindet aus den Listen und kann nicht mehr aktiviert werden, auch nicht nach einem Neustart, bei dem der Controller dann auf ein Standardprofil zurückfällt.",
    listTitle: "Profile ({{count}})",
    newProfile: "Neues Profil",
    points: "{{count}} Punkte",
    custom: "Benutzerdefiniert",
    system: "System",
    active: "Aktiv",
    activate: "Aktivieren",
    duplicate: "Duplizieren",
    edit: "Bearbeiten",
    delete: "Löschen",
    copySuffix: "(Kopie)",
    icons: { Flame: "Flamme", Snowflake: "Kälte", Zap: "Blitz", Wind: "Wind", Gauge: "Anzeige", Thermometer: "Thermometer", Moon: "Leise", Cpu: "CPU", Leaf: "Öko", Rocket: "Turbo" },
    form: {
      editTitle: "„{{name}}“ bearbeiten",
      newTitle: "Neues Profil",
      cancel: "Abbrechen",
      save: "Speichern",
      create: "Profil erstellen",
      name: "Name",
      namePlaceholder: "z. B. Gaming",
      description: "Beschreibung",
      descriptionPlaceholder: "Optional",
      icon: "Symbol",
      startFrom: "Von einem bestehenden Profil ausgehen",
      copyCurve: "Kurve kopieren von…",
      curve: "Kurve",
      step: "Stufe",
      help: "Jede Zeile der Tabelle ist ein Punkt der Kurve: Die erste Spalte gibt die Temperatur in Grad an, die zweite die Lüfterdrehzahl in Prozent. Je nach in den Einstellungen gewähltem Modus legt ein Punkt die Drehzahl fest, solange die Temperatur unter seinem Wert bleibt (Steep), oder dient als Stützpunkt, zwischen denen die Drehzahl interpoliert wird (Smooth); in beiden Fällen gilt die Drehzahl des letzten Punkts über seiner Temperatur. Im Diagramm kannst du einen Punkt ziehen, um seine Drehzahl (in 5-%-Schritten) und seine Temperatur (pro Grad, ohne seine Nachbarn zu überschreiten) einzustellen, auf den Hintergrund doppelklicken, um einen Punkt genau auf der aktuellen Kurve hinzuzufügen, oder auf einen Punkt doppelklicken, um ihn zu entfernen; per Tastatur wählst du einen Punkt aus und nutzt die Pfeile (hoch und runter für die Drehzahl, links und rechts für die Temperatur) und Entf zum Entfernen. Du kannst die Werte auch direkt in die Tabelle eingeben, für mehr Genauigkeit, einen Punkt mit der Schaltfläche „Stufe“ hinzufügen oder mit dem Kreuz entfernen (mindestens einer ist nötig). Die Punkte werden beim Speichern nach Temperatur sortiert und die Drehzahlen auf 0 bis 100 % begrenzt. Achte darauf, dass die Kurve mit der Temperatur steigt: Eine Kurve, die bei Hitze fiele, würde den Lüfter im schlechtesten Moment bremsen. Der Name ist Pflicht, Beschreibung und Symbol dienen nur dazu, das Profil in den Listen wiederzuerkennen.",
      upTo: "Bis (°C)",
      speed: "Drehzahl (%)",
      removeStep: "Stufe entfernen",
    },
    editor: { fanSpeed: "Lüfterdrehzahl (%)", cpuTemp: "CPU-Temperatur (°C)", point: "Punkt {{n}}: {{temp}}° bei {{speed}} %" },
  },
  settings: {
    summary:
      "Diese <b>globalen Einstellungen</b> betreffen den Controller als Ganzes und kein bestimmtes Profil. Sie werden in einer Datei <code>settings.json</code> neben der ausführbaren Datei des Controllers gespeichert, sodass sie bei jedem Start unverändert wiedergefunden werden, egal ob der Controller von der Anwendung oder von Windows gestartet wird. Hier stellst du ein, wie die Temperatur in Lüfterdrehzahl umgerechnet wird. Der Windows-Dienst, die Warnungen und die Tastenkürzel haben ihren eigenen Abschnitt „Konfiguration“ in der Seitenleiste.",
    details:
      "Der Modus für den <b>Drehzahlübergang</b> gilt für alle Profile, aber nur im Auto-Modus: Im manuellen Modus wird die Kurve ohnehin nicht verwendet. Bei <b>Steep</b> arbeitet die Kurve in Stufen: Jeder Punkt legt die Drehzahl fest, solange die Temperatur unter seinem Wert bleibt, dann springt die Drehzahl auf die nächste Stufe, sobald diese Schwelle überschritten wird. Bei <b>Smooth</b> wird die Drehzahl durch lineare Interpolation zwischen zwei benachbarten Punkten berechnet, was einen gleichmäßigen Anstieg ergibt; unter dem ersten Punkt bleibt dessen Drehzahl erhalten, über dem letzten Punkt gilt die des letzten Punkts. In beiden Fällen erreicht der Controller das Ziel anschließend in kleinen Schritten, um abrupte Lärmschwankungen zu vermeiden. Die kleinen Illustrationen skizzieren den Unterschied zwischen beiden Modi anhand einer Beispielkurve; klicke auf eine Karte, um ihren Modus zu wählen, die Änderung wird sofort angewendet und gespeichert.",
    curveTitle: "Drehzahlübergang",
    curveDescription:
      "Wähle, wie die Prozessortemperatur in Lüfterdrehzahl umgerechnet wird, wenn der Auto-Modus aktiv ist. Die Einstellung ist global: Sie gilt für alle Profile, System- wie benutzerdefinierte, und wird für die nächsten Starts in <code>settings.json</code> gespeichert, egal ob der Controller von der Anwendung oder von Windows gestartet wird. Im manuellen Modus, wo die Kurve nicht verwendet wird, hat sie keine Wirkung. Die Kurven unten sind ein theoretisches Beispiel zur Veranschaulichung des Unterschieds; deine eigenen Profile behalten ihre Punkte, nur die Art, sie zu lesen, ändert sich.",
    steep:
      "Die Drehzahl springt von einer Stufe zur nächsten: Jeder Punkt der Kurve legt die Drehzahl fest, solange die Temperatur unter seinem Wert bleibt, dann geht der Lüfter sofort zur nächsten Stufe über, sobald diese Schwelle überschritten wird (der Controller glättet den Übergang dennoch über einige Zehntelsekunden). Das Verhalten ist sehr gut lesbar und vorhersehbar: Zu einer bestimmten Temperatur gehört immer eine klar erkennbare Drehzahl auf der Kurve, was die Feinabstimmung erleichtert. Dafür kann man bei jeder überschrittenen Schwelle einen Drehzahlwechsel hören, besonders wenn die Temperatur um eine davon schwankt.",
    smooth:
      "Die Drehzahl ändert sich schrittweise: Sie wird linear zwischen zwei benachbarten Punkten der Kurve interpoliert, sodass jedes Grad mehr oder weniger zu einer kleinen Drehzahlanpassung führt, ohne jemals eine abrupte Stufe. Unter dem ersten Punkt bleibt dessen Drehzahl erhalten, über dem letzten Punkt die des letzten Punkts. Die Drehzahlwechsel sind dezenter und der Lüfter bleibt ruhiger, was bei einem Gerät mit stark schwankender Temperatur oft angenehmer fürs Ohr ist, auf Kosten einer etwas weniger direkt lesbaren Kurve: Die reale Drehzahl liegt zwischen zwei Punkten, nicht auf einer Stufe.",
    tuning: {
      title: "Feineinstellungen des Auto-Modus",
      description:
        "Diese Einstellungen gelten für <b>alle Profile</b> und nur im Auto-Modus. Die <b>Hysterese</b> verhindert, dass der Lüfter „pumpt“, wenn die Temperatur um eine Schwelle schwankt: Eine Drehzahlsenkung wird erst angewendet, wenn die Temperatur um die gewählte Gradzahl unter die der letzten Änderung gefallen ist. Der <b>Spitzenfilter</b> lässt den Controller auf den Durchschnitt der letzten Sekunden statt auf jede Messung reagieren, um eine kurze Spitze zu ignorieren. <b>Drehzahlerhöhungen bleiben sofort wirksam</b> und der Filter wird ab 90° umgangen: Kühlen geht vor Ruhe. Ein Wechsel von Profil oder Kurvenmodus gilt sofort. Die <b>Glättung</b> legt fest, wie schnell der Lüfter seinen neuen Sollwert erreicht.",
      hysteresis: "Hysterese",
      hysteresisOff: "Aus: Der Lüfter wird langsamer, sobald die Kurve es verlangt.",
      hysteresisOn: "Wird langsamer nach einem Abfall von {{value}}° unter die letzte Änderung.",
      filter: "Spitzenfilter",
      filterOff: "Aus: Jede Temperaturmessung zählt.",
      filterOn: "Gleitender Durchschnitt über die letzten {{value}} Sekunden.",
      smoothing: "Glättung der Übergänge",
      smoothingOptions: {
        fast: { title: "Reaktionsschnell", text: "Der Lüfter wechselt die Drehzahl doppelt so schnell. Er folgt der Temperatur eng, auf Kosten hörbarerer Lärmschwankungen." },
        normal: { title: "Normal", text: "Das vom aktiven Profil festgelegte Tempo, unverändert." },
        slow: { title: "Sanft", text: "Die Drehzahlwechsel sind dreimal langsamer: sehr gleichmäßiges Hoch- und Herunterdrehen, kaum hörbar." },
      },
    },
  },
}
