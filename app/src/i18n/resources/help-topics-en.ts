/** Detailed explanations of the Help page (English). Paragraphs are separated by a blank line and shown in their own block. */
export const topicsEn = {
  curve: {
    title: "The fan curve",
    body: `Each profile contains a curve: a list of points that map a processor temperature (in °C) to a fan speed (in %). In Auto mode, the controller reads the temperature about every two seconds, finds where it falls on the curve and derives the requested speed. In Manual mode the curve is not used: the speed you set wins.

The shape of the curve is a trade-off between noise and temperature. A curve that rises early and fast keeps the machine cool but spins the fan up even under light loads. A curve that stays low for long is quiet, but lets the temperature climb further before reacting. The provided profiles (quiet, balanced, performance, etc.) are starting points: you can create others in the Profiles page by dragging the points with the mouse.

How the speed moves from one point to the next depends on the curve mode chosen in Settings (steep or smooth, see below). In every case the controller does not apply the new speed in one go: it approaches it in small steps, to avoid sudden noise changes.

To judge whether a curve suits you, watch the Info page or the mini widget during a usual load (a game, a build): if the temperature settles below 80 °C without the fan being too loud, the curve is good. If it often exceeds 85 °C, raise the upper points; if the fan races for nothing, lower the bottom ones or increase the hysteresis.`,
  },
  hysteresis: {
    title: "Hysteresis, filter and smoothing",
    body: `These three settings, in Settings > Fan control, all make the fan calmer without changing the curve itself. They apply to every profile and only in Auto mode.

Hysteresis (0 to 10 °C) is the margin the temperature must drop by before the fan slows down. Without it, a temperature oscillating by one degree around a threshold would make the speed rise and fall endlessly, which is very audible. With 3 °C, for example, if the curve asked for 60% at 70 °C, the fan only drops below 60% once the temperature has fallen by about 3 degrees. Speeding up stays immediate: a rise in speed is never delayed, only the decrease.

The temperature filter (0 to 20 seconds, in steps of 2) averages recent readings before comparing them to the curve. It discards very short spikes: a processor jumping 15 degrees for a second when a program opens will no longer race the fan. Since the controller reads the temperature every two seconds, a window only makes sense in multiples of 2. A value that is too large delays the reaction to a real heat build-up; beyond 20 seconds it would be risky, which is why the limit exists.

Smoothing (fast, normal or slow) sets how quickly the actual speed reaches the target speed. Fast reacts almost at once; slow spreads the change over several seconds, which removes audible jolts.

For a discreet everyday fan, try 2 to 3 °C of hysteresis, a 4 to 6 second filter and normal smoothing. For intensive gaming where reactivity matters, set hysteresis to 1 °C, a short or no filter and fast smoothing.`,
  },
  curveMode: {
    title: "Steep or smooth curve",
    body: `The curve mode, in Settings > Fan control, decides how the speed is read from the curve between two points. It applies to every profile.

In steep mode, the curve works in steps: each point sets the speed as long as the temperature stays below its value, then the speed jumps to the next step as soon as that threshold is crossed. It is very readable and predictable: a given temperature always corresponds to a clearly identifiable speed on the curve, which makes fine tuning easier. In return, you may hear a change of speed at each threshold crossed, especially when the temperature oscillates around one of them.

In smooth mode, the speed follows a rounded curve that passes through every point, without going beyond the speeds of the two neighboring points: each extra degree translates into a small adjustment, with no abrupt step. Below the first point the speed of that point is kept; above the last point the last point's speed applies. Speed changes are more discreet and the fan stays steadier, which is often more pleasant on a machine whose temperature fluctuates a lot.

In both cases the controller then reaches the target in small steps. If in doubt, start with smooth mode: it is the most comfortable to the ear. Pick steep mode if you want each step to be exactly the one you drew.`,
  },
  fan2: {
    title: "The second fan",
    body: `Some models have two fans: one mostly blows on the processor, the other on the graphics card. The application only shows the second one if the machine reports it and it has seen it spin. Its card is in the Control panel page.

It has four modes. Firmware: the motherboard drives it alone, the original behavior. Follow: it receives the same setpoint as fan 1. Manual: you set its speed as a percentage. Curve: it follows its own curve, independent of the profile's.

Fan 2's curve is built on a temperature source of your choice: the processor, the graphics card, or the higher of the two. This is the most useful setting on a gaming laptop: you can make fan 2 blow according to the graphics card while fan 1 keeps following the processor. One click on "Curve" immediately applies the last saved curve; the "Apply" button only becomes active after a change, to save and apply it.

Beware of the actual speed: the setpoint you send is not necessarily followed by the hardware, which is why only the measured speed in revolutions per minute is authoritative. If the fan does not spin while a setpoint is requested, a stalled-fan alert can warn you (see the Alerts page).

The settings backup does not include fan 2's mode, deliberately: restoring it would change how the hardware is driven without you asking.`,
  },
  bios: {
    title: "BIOS mode",
    body: `BIOS mode describes a situation where the machine's firmware, not Baridi, drives the fans. In this state your profile's curve is ignored: the speed you see is not the one the controller asked for.

It happens after commanding fan 2 and then handing control back to the firmware. The manufacturer's DLL uses a test mode to take control of the fans; when you return to firmware mode it switches that test mode off for both fans at once, including fan 1, which you were driving. The motherboard then takes both back, with its own curves, usually more conservative.

The application shows it in two ways. On the fan card, the power is no longer displayed (replacing it with a setpoint that is not followed would be misleading) and a message says the machine is in BIOS mode. The controller also reports this in the state it publishes.

To take control back, simply restart Auto mode, pick a profile or set a manual speed: the controller then rewrites fan 1's setpoint and resumes driving. If you deliberately want to leave the second fan to the firmware, that is not a problem in itself: only fan 1 needs to stay driven by the controller.`,
  },
  tempSource: {
    title: "The reference temperature",
    body: `Fan 1's curve needs a temperature to work with. By default it is the processor's, which is the only one the firmware provides. In Settings > Fan control you can choose "the highest: processor or graphics card".

In this second mode, the controller compares both temperatures at each reading and uses the higher one. The benefit shows in situations where the graphics card heats up without the processor being busy: a game well optimized on the processor side, 3D rendering, a computation on the card. With the "processor only" source the fan would stay slow while the card gets hot; with "the highest" it speeds up to cool it too.

IMPORTANT: the application never wakes the card to measure it. If the card is asleep (see "Sleeping graphics card"), its temperature is simply ignored and the processor's applies. This choice avoids raising power use and draining the battery for a pointless reading.

This setting only concerns fan 1. Fan 2 has its own source in its card: processor, graphics card or the highest.`,
  },
  throttle: {
    title: "Throttling",
    body: `When a chip gets too hot, reaches its power limit or runs short of energy, it lowers its own frequency to protect itself. This is called throttling. The machine does not crash, but becomes noticeably slower, sometimes for several minutes.

For the processor, the application cannot read the throttling state directly: it infers it. When the measured frequency is far below the base frequency while the processor is heavily loaded, it displays "probable throttling". It is an inference, not an exact reading: a processor in power-saving mode can also lower its frequency without being in trouble, hence the heavy-load condition.

For the graphics card, the NVIDIA driver gives the reasons. "Hardware thermal protection" is the chip's real protection: it means it is too hot. "Platform thermal cap" is declared permanently by most laptops, even at 50 °C: the application does not count it as throttling. "Power limit" means the card has reached the allowed energy ceiling (common with a weak charger or on battery), and "hardware slowdown" groups the other causes.

The history keeps track of throttling episodes (their number and cumulative duration) and shows them in the 24-hour summary and in the report. If you see them regularly, it is a sign of insufficient cooling: clean the vents and fans, check the History page for dust build-up, and consider a more aggressive curve.`,
  },
  power: {
    title: "PL1, PL2 and the power plan",
    body: `A laptop processor is held back by two power limits. PL1 is the power it can sustain without overheating; PL2 is the higher power it can reach briefly, for example when a heavy program starts, before falling back toward PL1. These limits, more than temperature, determine a processor's speed under prolonged load.

The application reads both values from the manufacturer's DLL, read-only. They are shown as the machine reports them, without a reliable unit: do not interpret them as watts. An obviously absurd value is discarded. For the processor's power and voltage, the unit is not documented either: they are raw values, useful to follow a trend.

The Windows power plan is another, simpler lever. The standard plans (power saver, balanced, high performance) change the maximum frequency Windows allows, how the processor ramps up and the sleep level of components. The application can read and change the active plan in the Energy and battery page; the "Ultimate performance" plan, often hidden by Windows, is only offered if installed.

Automation can also pick the plan for you: for example switch to power saver as soon as the machine is on battery, and go back to balanced once plugged in.`,
  },
  gpuSleep: {
    title: "Sleeping graphics card",
    body: `On a hybrid laptop (Optimus technology), the NVIDIA card switches off completely when nobody uses it: the display goes through the graphics chip built into the processor. Windows describes its state with a code: D0 (on) or D3 (deep sleep). This is what makes decent battery life possible, since a powered card draws several watts even idle.

The catch is that querying the card wakes it up. If the application read it every second, it would keep it from sleeping, raise battery drain and needlessly heat the machine. That is why Baridi first checks the card's power state: if it sleeps, it does not read it, shows no value in its place and says so clearly (Graphics card page and hardware card in Info).

As soon as a program uses the card, Windows wakes it and readings resume by themselves: temperature, load, memory, frequencies, power and programs using it. The card's temperature alerts and the "highest" temperature source only act in those moments.

In the history, the period when the card slept appears as a gap in the card's curves, not as a zero value: this is normal and intended.

The graphics mode is inferred from the cards present: hybrid (Optimus), discrete (NVIDIA card alone) or integrated. Only hybrid mode has this sleep behavior.`,
  },
  history: {
    title: "History, reports and dust build-up",
    body: `The controller runs permanently, even when the window is closed. Every 30 seconds it writes to a file (history.jsonl, next to its executable) the processor temperature, the setpoint and speed of the fans, and when available the processor load, the graphics card, the battery, the power exchanged and throttling episodes. It keeps 14 days, about 40,000 lines (a few megabytes). A power cut can only damage the last line.

Processor load and graphics card readings are only recorded when the interface has measured recently: measuring them in the background would keep the card from sleeping. They are therefore missing when the interface was closed. Temperature and fans are always there.

The History page shows the curves, the summary of the last 24 hours and advice. The Reports page computes key figures over 7 or 14 days (average, maximum, time above 70 and 80 °C, energy drawn from the battery, etc.) and exports the readings as CSV for Excel.

The dust build-up diagnosis compares, over the days, the speed needed for the same temperature. If the fan must spin faster and faster to achieve the same cooling, it is probably dust in the heatsink or vents. About four hours of readings are needed before it commits. The results are: not enough history, no drift, slight drop to watch, or clear drop with a cleaning recommendation.

For battery health, the controller also records one reading per day (wear, capacity, cycles) in battery_health.jsonl, with no time limit: the trend appears in the Energy and battery page after two days.`,
  },
  automation: {
    title: "Automation",
    body: `Automation applies a fan profile, and optionally a power plan, depending on context, without you having to think about it. It is set up in the Automation page and enabled globally with a switch.

Each rule has a trigger, a value and an action. There are four triggers: "program running" (for example a game; you pick the application from a list with icons and search), "power source" (mains or battery), "Windows power plan" (when that plan is active) and "battery below a level" (for example under 20%). The action is a profile, with an optional power plan to enforce.

Rules are examined in list order, which is therefore their priority: the first one whose condition is true wins. The engine checks the context every five seconds. When no rule applies any more, the original profile and original plan are restored.

Useful examples: performance profile while a game runs; quiet profile and power saver plan on battery; quiet profile when the battery falls below 20%. Put the most specific rules at the top (the game before the power source), otherwise a general rule will mask the others.

Each rule can be enabled, edited, saved or cancelled separately. Rules are part of the backup exported from the Backup page.`,
  },
  widget: {
    title: "Mini widget",
    body: `The mini widget is a small borderless window, always on top of the others, that shows live what matters most: a chart of the temperature and both fan speeds, and four cards for the main indicators. It follows the application's light or dark theme.

It is set up in Settings > Mini widget. The switch shows or hides it; the resting opacity (30, 55 or 80%) sets its transparency while you are not hovering it. As soon as the mouse passes over, it becomes sharp again, so it can stay permanently in a screen corner without getting in the way. You can move it by dragging, and its position is remembered between launches.

Click-through makes the widget ignore the mouse: your clicks go to the window underneath, ideal mid-game. Note that it can then no longer be moved, closed or hovered. To make it clickable again, use the switch in Settings or the Ctrl+Shift+F6 keyboard shortcut.

The Ctrl+Shift+F5 shortcut shows or hides the widget in one gesture, without opening the application. Shortcuts must be enabled in the Shortcuts page, and their combinations can be changed there; if Windows refuses one, the Logs page says so.`,
  },
}
