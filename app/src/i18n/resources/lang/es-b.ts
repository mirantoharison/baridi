/** Español, parte 2/3 : control, perfiles, ajustes. */
export const esB = {
  control: {
    confirm: { cancel: "Cancelar", continueAnyway: "Continuar de todos modos" },
    guards: {
      manual: "El procesador está a {{temp}}° y la velocidad solicitada es {{percent}} %. Por debajo de {{min}} %, puede seguir calentándose: nada regulará la velocidad mientras sigas en modo Manual.",
      stop: "El procesador está a {{temp}}°. En modo Apagado, el ventilador mantiene su última velocidad y ya no se adapta a la temperatura: si sube, nada lo acelerará.",
      lowSpeedTitle: "Velocidad manual baja",
      stopTitle: "¿Detener el control automático?",
    },
    card: {
      title: "Control",
      modes: { auto: "Auto", manual: "Manual", idle: "Apagado" },
      manualSpeed: "Velocidad manual",
      autoText:
        "El modo Auto está activo: cada 2 segundos, el controlador lee la temperatura del procesador, determina la velocidad prevista por la curva del perfil activo y lleva el ventilador hasta ella de forma progresiva, en pequeños pasos para evitar cambios bruscos de régimen. No hay nada que ajustar aquí: cambia de perfil activo más abajo si quieres un comportamiento más silencioso o más refrescante. Elige Manual si quieres fijar tú la velocidad, por ejemplo para una prueba de ruido o para forzar la máxima refrigeración antes de una tarea pesada; el control deslizante aparecerá entonces en este lugar.",
      idleText:
        "El control automático está detenido: el controlador ya no lee la temperatura para ajustar la velocidad, y el ventilador se queda en la última velocidad aplicada hasta tu próxima elección, sin que el comportamiento original del equipo recupere el control. Vigila la temperatura en la pestaña Info, porque nada la hará bajar hasta que reactives el modo Auto o fijes una velocidad en modo Manual. Si piensas dejar el ordenador sin vigilancia, vuelve a Auto: es el modo más seguro, ya que la velocidad se adapta entonces a la temperatura en cada momento.",
    },
    tab: {
      summary:
        "Esta pestaña sirve para <b>controlar el ventilador en directo</b>. Eliges el <b>modo de funcionamiento</b> (Auto, Manual o Apagado), fijas la velocidad a mano cuando quieres tomar el control y seleccionas el <b>perfil activo</b>, cuya curva decide la velocidad en modo Auto. La curva mostrada abajo enseña exactamente lo que aplica el controlador, con una marca vertical que sigue la temperatura del procesador en tiempo real: ves en todo momento dónde estás en la curva y qué velocidad resulta. Todas las acciones de esta pestaña se envían de inmediato al controlador y se registran en la pestaña Registros, lo que permite comprobar después qué se pidió y a qué hora.",
      details:
        "En modo <b>Auto</b>, el controlador lee la temperatura cada 2 segundos, calcula la velocidad objetivo a partir de la curva del perfil activo y alcanza ese objetivo en pequeños pasos sucesivos en lugar de de golpe (por defecto, 5 unidades de PWM cada 50 milisegundos), lo que evita los picos de ruido; la transición solo se reinicia si el objetivo ha cambiado de verdad. El controlador arranca siempre en Auto, con el último perfil usado, incluso cuando se inicia como servicio antes de que abras la aplicación. En modo <b>Manual</b>, el control automático se desactiva y la velocidad que eliges (en pasos de 5 %, con preajustes de 25, 50, 75 y 100 %) se aplica tal cual, sea cual sea la temperatura: recuerda vigilarla en la pestaña Info. El valor solo se envía una fracción de segundo después de soltar el control deslizante, para no saturar el controlador de peticiones mientras lo arrastras. En modo <b>Apagado</b>, el control automático simplemente se suspende y se conserva la velocidad actual, sin volver al comportamiento original del equipo: nada hará bajar la temperatura hasta que reactives el modo Auto. Cambiar el perfil activo surte efecto en la siguiente lectura en modo Auto, como máximo 2 segundos después, y esta elección se recuerda para el próximo inicio. Cuando el ordenador entra en suspensión, el controlador suspende el control automático y lo reanuda al despertar. Al cerrar la aplicación, o al apagar Windows, devuelve el ventilador al perfil Balanced antes de detenerse, para no dejar nunca el equipo a una velocidad fija. Si el controlador funciona como servicio de Windows, cerrar la aplicación no lo detiene: el control continúa.",
      activeProfile: "Perfil activo",
      chooseProfile: "Elegir un perfil",
      custom: "Personalizado",
      noProfile: "Ningún perfil seleccionado.",
    },
    fan2: {
      title: "Ventilador 2",
      modes: { firmware: "BIOS", follow: "Seguir al 1", manual: "Manual", curve: "Curva" },
      descriptions: {
        firmware:
          "La BIOS de la placa base controla este ventilador. Al arrancar es el modo por defecto y no tiene ningún efecto sobre el ventilador 1. Pero volver a él después de «Seguir al 1» o «Manual» desactiva el modo de prueba de la DLL, lo que devuelve TAMBIÉN el ventilador 1 a la BIOS: la curva de tu perfil se ignora mientras este modo siga activo. La BIOS mantiene el equipo fresco, pero ya no sigue tus ajustes.",
        follow:
          "Este ventilador recibe la misma consigna que el ventilador 1: sigue por tanto la curva del perfil activo, incluidos el suavizado y la histéresis. La consigna se reescribe en pasos de unos 4 % para no frenar la subida de velocidad.",
        manual:
          "Tú fijas la velocidad de este ventilador. Se mantiene sea cual sea la temperatura del procesador, salvo por encima de 85°, donde vuelve solo al modo «Seguir al 1». Esta elección nunca se recuerda: en el próximo inicio, vuelve a estar controlado por el firmware.",
        curve:
          "Este ventilador tiene su propia curva, independiente del perfil, basada en la temperatura que elijas. En este portátil es el de la tarjeta gráfica: basarlo en la GPU hace que acelere cuando un juego la exige, aunque el procesador siga fresco. La temperatura de la tarjeta solo se lee si ya está despierta: la aplicación nunca la despierta y recurre a la del procesador cuando duerme. Por encima de 85° (procesador), vuelve a «Seguir al 1». Esta curva se recuerda.",
      },
      sources: { cpu: "Temperatura del procesador", gpu: "Temperatura de la tarjeta gráfica", max: "La más alta de las dos" },
      manualSpeed: "Velocidad manual",
      basedOn: "Basada en",
      applyCurve: "Aplicar la curva",
      biosOverride: "La BIOS controla actualmente <b>los dos</b> ventiladores: la curva de tu perfil se ignora, aunque la página Control muestre «Auto». Elige «Seguir al 1» o «Manual» para recuperarla.",
      biosConfirmTitle: "¿Pasar al modo BIOS?",
      biosConfirmMessage: "La BIOS va a controlar los dos ventiladores, incluido el ventilador 1: la curva de tu perfil se ignorará mientras sigas en este modo. Para recuperarla, elige «Seguir al 1» o «Manual».",
      biosConfirmLabel: "Pasar a BIOS",
    },
    powerPlan: {
      title: "Plan de energía de Windows",
      description: "El plan de Windows regula la potencia máxima del procesador y la suspensión, además de tu perfil de ventilador. El cambio se aplica a todo el equipo.",
      customActive: " Hay un plan personalizado activo: elegir un plan estándar lo sustituye.",
      currently: "Actualmente: {{plan}}",
      plans: { "Équilibré": "Equilibrado", "Performances élevées": "Alto rendimiento", "Performances maximales": "Máximo rendimiento", "Économie d'énergie": "Economizador", "Personnalisé": "Personalizado" },
    },
    tempSource: {
      title: "Temperatura seguida por la curva",
      description: "Elige qué controla el ventilador 1 en modo Auto. La temperatura de la tarjeta gráfica solo se lee si la tarjeta ya está despierta: la aplicación nunca la despierta y, cuando duerme, se aplica la temperatura del procesador. El ventilador 2 tiene su propia fuente, que se ajusta en su tarjeta de la página Control.",
      cpuTitle: "Solo el procesador",
      cpuText: "La curva del ventilador 1 sigue únicamente la temperatura del procesador. Es el comportamiento original.",
      maxTitle: "La más alta: procesador o tarjeta gráfica",
      maxText: "La curva sigue la más alta de las dos temperaturas. Un juego que calienta la tarjeta gráfica acelera el ventilador aunque el procesador siga fresco.",
    },
  },
  profiles: {
    summary:
      "Esta pestaña reúne <b>todos tus perfiles en un mismo lugar</b>. La lista superior muestra los perfiles del <b>sistema</b> (bloqueados con un candado: vienen con la aplicación y no se pueden modificar ni eliminar) y tus perfiles <b>personalizados</b>, que puedes crear, modificar y eliminar libremente; muestra cuatro perfiles a la vez y se desplaza más allá. Cada fila recuerda el icono del perfil, su nombre, su descripción y una vista previa de su curva, y una marca verde indica el que está activo. Haz clic en una fila para ver debajo la curva detallada del perfil seleccionado, con la temperatura actual como marca, y las acciones posibles: activar el perfil, duplicarlo y, para un perfil personalizado, modificarlo o eliminarlo.",
    details:
      "Un perfil es una curva que asocia una temperatura a una velocidad de ventilador, con un nombre, una descripción opcional y un icono elegido entre diez (llama, frío, rayo, viento, indicador, termómetro, silencioso, procesador, eco y turbo) que te ayuda a reconocerlo en las listas. Se incluyen tres perfiles del sistema: <b>Silent</b>, que prioriza el silencio y solo sube de régimen cuando el equipo se calienta de verdad; <b>Balanced</b>, un compromiso entre ruido y refrigeración; y <b>Turbo</b>, que refrigera con agresividad desde los primeros grados. Los perfiles personalizados los guarda el controlador en un archivo <code>profiles.json</code> junto a su ejecutable: puedes copiarlo, llevarlo a otro equipo o modificarlo a mano, siempre que conserves un JSON válido. Al guardar, los puntos se ordenan por temperatura y cada velocidad se limita entre 0 y 100 %, escribas lo que escribas. El botón <b>Duplicar</b> abre el formulario de creación rellenado con la curva del perfil seleccionado y el nombre seguido de «(copia)»: es la forma más sencilla de partir de una buena base, incluso desde un perfil del sistema. <b>Activar</b> aplica el perfil de inmediato y lo recuerda para el próximo inicio. Modificar el perfil activo actualiza su curva al guardar. Eliminar el perfil activo no cambia la curva en uso mientras no se elija otro perfil, pero desaparece de las listas y ya no se podrá reactivar, tampoco tras un reinicio, en el que el controlador volverá a un perfil por defecto.",
    listTitle: "Perfiles ({{count}})",
    newProfile: "Nuevo perfil",
    points: "{{count}} puntos",
    custom: "Personalizado",
    system: "Sistema",
    active: "Activo",
    activate: "Activar",
    duplicate: "Duplicar",
    edit: "Modificar",
    delete: "Eliminar",
    copySuffix: "(copia)",
    icons: { Flame: "Llama", Snowflake: "Frío", Zap: "Rayo", Wind: "Viento", Gauge: "Indicador", Thermometer: "Termómetro", Moon: "Silencioso", Cpu: "CPU", Leaf: "Eco", Rocket: "Turbo" },
    form: {
      editTitle: "Modificar «{{name}}»",
      newTitle: "Nuevo perfil",
      cancel: "Cancelar",
      save: "Guardar",
      create: "Crear el perfil",
      name: "Nombre",
      namePlaceholder: "Ej. Juegos",
      description: "Descripción",
      descriptionPlaceholder: "Opcional",
      icon: "Icono",
      startFrom: "Partir de un perfil existente",
      copyCurve: "Copiar la curva de…",
      curve: "Curva",
      step: "Tramo",
      help: "Cada fila de la tabla es un punto de la curva: la primera columna indica la temperatura en grados y la segunda la velocidad del ventilador en porcentaje. Según el modo elegido en los ajustes, un punto fija la velocidad mientras la temperatura se mantiene por debajo de su valor (Steep) o sirve de referencia entre las que se interpola la velocidad (Smooth); en ambos casos, la velocidad del último punto se aplica más allá de su temperatura. En el gráfico puedes arrastrar un punto para ajustar su velocidad (en pasos de 5 %) y su temperatura (por grado, sin pasar a sus vecinos), hacer doble clic en el fondo para añadir un punto exactamente sobre la curva actual, o hacer doble clic en un punto para quitarlo; con el teclado, selecciona un punto y usa las flechas (arriba y abajo para la velocidad, izquierda y derecha para la temperatura) y Supr para quitarlo. También puedes escribir los valores directamente en la tabla para mayor precisión, añadir un punto con el botón «Tramo» o quitar uno con la cruz (se necesita al menos uno). Los puntos se ordenan por temperatura al guardar y las velocidades se limitan entre 0 y 100 %. Procura que la curva suba con la temperatura: una curva que bajara en caliente frenaría el ventilador en el peor momento. El nombre es obligatorio; la descripción y el icono solo sirven para reconocer el perfil en las listas.",
      upTo: "Hasta (°C)",
      speed: "Velocidad (%)",
      removeStep: "Quitar el tramo",
    },
    editor: { fanSpeed: "Velocidad del ventilador (%)", cpuTemp: "Temperatura de la CPU (°C)", point: "Punto {{n}}: {{temp}}° para {{speed}} %" },
  },
  settings: {
    summary:
      "Estas <b>preferencias globales</b> afectan al controlador en su conjunto y no a un perfil concreto. Se guardan en un archivo <code>settings.json</code> junto al ejecutable del controlador, lo que significa que se recuperan tal cual en cada inicio, ya sea que el controlador lo arranque la aplicación o Windows. Aquí ajustas cómo se convierte la temperatura en velocidad de ventilador. El servicio de Windows, las alertas y los atajos de teclado tienen su propia sección «Configuración» en la barra lateral.",
    details:
      "El modo de <b>transición de velocidad</b> se aplica a todos los perfiles, pero solo en modo Auto: en modo Manual la curva no se usa de todos modos. En <b>Steep</b>, la curva funciona por tramos: cada punto fija la velocidad mientras la temperatura se mantiene por debajo de su valor y luego la velocidad salta al tramo siguiente en cuanto se supera ese umbral. En <b>Smooth</b>, la velocidad se calcula por interpolación lineal entre dos puntos vecinos, lo que da una subida progresiva; por debajo del primer punto se conserva la velocidad de ese punto, y por encima del último se aplica la del último punto. En ambos casos, el controlador alcanza después el objetivo en pequeños pasos para evitar variaciones bruscas de ruido. Las pequeñas ilustraciones esquematizan la diferencia entre ambos modos a partir de una curva de ejemplo; haz clic en una tarjeta para seleccionar su modo, el cambio se aplica de inmediato y se recuerda.",
    curveTitle: "Transición de velocidad",
    curveDescription:
      "Elige cómo se convierte la temperatura del procesador en velocidad de ventilador cuando el modo Auto está activo. El ajuste es global: vale para todos los perfiles, del sistema y personalizados, y se guarda en <code>settings.json</code> para los próximos inicios, ya sea que el controlador lo arranque la aplicación o Windows. No tiene ningún efecto en modo Manual, donde la curva no se usa. Las curvas de abajo son un ejemplo teórico para ilustrar la diferencia; tus propios perfiles conservan sus puntos, solo cambia la forma de leerlos.",
    steep:
      "La velocidad salta de un tramo al siguiente: cada punto de la curva fija la velocidad mientras la temperatura se mantiene por debajo de su valor, y luego el ventilador pasa de golpe al tramo siguiente en cuanto se supera ese umbral (el controlador suaviza igualmente la transición durante unas décimas de segundo). El comportamiento es muy legible y predecible: a una temperatura dada corresponde siempre una velocidad claramente identificable en la curva, lo que facilita los ajustes finos. A cambio, puede oírse un cambio de régimen en cada umbral superado, sobre todo cuando la temperatura oscila alrededor de alguno.",
    smooth:
      "La velocidad evoluciona de forma progresiva: se interpola linealmente entre dos puntos vecinos de la curva, de modo que cada grado de más o de menos se traduce en un pequeño ajuste de velocidad, sin escalones bruscos. Por debajo del primer punto se conserva la velocidad de ese punto, y por encima del último la del último punto. Los cambios de régimen son más discretos y el ventilador se mantiene más estable, lo que suele ser más agradable al oído en un equipo cuya temperatura fluctúa mucho, a costa de una curva algo menos directa de leer: la velocidad real está entre dos puntos, no sobre un tramo.",
    tuning: {
      title: "Ajustes finos del modo Auto",
      description:
        "Estos ajustes se aplican a <b>todos los perfiles</b> y solo en modo Auto. La <b>histéresis</b> evita que el ventilador «bombee» cuando la temperatura oscila alrededor de un umbral: una bajada de velocidad solo se aplica cuando la temperatura ha descendido el número de grados elegido por debajo de la del último cambio. El <b>filtro antipicos</b> hace que el controlador reaccione a la media de los últimos segundos en lugar de a cada medición, para ignorar un pico breve. Las <b>subidas de velocidad siguen siendo inmediatas</b> y el filtro se ignora a partir de 90°: refrigerar va antes que el silencio. Un cambio de perfil o de modo de curva se aplica enseguida. El <b>suavizado</b> regula la rapidez con la que el ventilador alcanza su nueva consigna.",
      hysteresis: "Histéresis",
      hysteresisOff: "Desactivada: el ventilador frena en cuanto la curva lo pide.",
      hysteresisOn: "Frena tras una bajada de {{value}}° por debajo del último cambio.",
      filter: "Filtro antipicos",
      filterOff: "Desactivado: cada medición de temperatura cuenta.",
      filterOn: "Media móvil de los últimos {{value}} segundos.",
      smoothing: "Suavizado de las transiciones",
      smoothingOptions: {
        fast: { title: "Reactivo", text: "El ventilador cambia de velocidad el doble de rápido. Sigue de cerca la temperatura, a costa de variaciones de ruido más audibles." },
        normal: { title: "Normal", text: "El ritmo definido por el perfil activo, sin modificar." },
        slow: { title: "Suave", text: "Los cambios de velocidad son tres veces más lentos: subidas y bajadas muy progresivas, casi inaudibles." },
      },
    },
  },
}
