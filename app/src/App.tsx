import { AlertTriangle, BookOpen, Gauge, Info, ListChecks, ScrollText, Settings2, SlidersHorizontal, Thermometer, Wind } from "lucide-react"
import baridiIcon from "@/assets/baridi-icon.png"
import { ConnectionStatus } from "@/components/connection-status"
import { ThemeToggle } from "@/components/theme-toggle"
import { InfoNote } from "@/components/info-note"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AboutTab } from "@/components/about-tab"
import { LogsTab } from "@/components/logs-tab"
import { PilotageTab } from "@/components/pilotage-tab"
import { ProfilesTab } from "@/components/profiles-tab"
import { SettingsTab } from "@/components/settings-tab"
import { FanRotor } from "@/components/fan-rotor"
import { HistoryChart } from "@/components/history-chart"
import { TempGauge } from "@/components/temp-gauge"
import { useFan } from "@/hooks/use-fan"

export default function App() {
  const fan = useFan()
  const s = fan.status

  return (
    <div className="flex h-full flex-col text-xs">
      <header className="flex items-center justify-between border-b px-6 py-2.5">
        <div className="flex items-center gap-2">
          <img src={baridiIcon} alt="" className="size-7 rounded-md" />
          <h1 className="text-xs font-semibold tracking-tight">Baridi - Fancontroller</h1>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <ConnectionStatus online={fan.online} />
        </div>
      </header>

      {fan.error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-6 py-2 text-destructive">
          <AlertTriangle className="size-4" /> {fan.error}
        </div>
      )}

      <Tabs defaultValue="info" className="min-h-0 flex-1 p-6 pt-4">
        <TabsList>
          <TabsTrigger value="info">
            <Info /> Info
          </TabsTrigger>
          <TabsTrigger value="control">
            <SlidersHorizontal /> Contrôle
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText /> Logs
          </TabsTrigger>
          <TabsTrigger value="about">
            <BookOpen /> À propos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="relative">
          <div className="absolute inset-0"><ScrollArea className="h-full">
          <div className="flex min-h-full flex-col gap-4 pr-3">
          <InfoNote
            summary={
              <>
              Cette page affiche l'état <b>en direct</b> du contrôleur Go qui pilote réellement le ventilateur de ton ordinateur. Les mesures arrivent en continu par un flux ouvert avec le contrôleur et sont rafraîchies <b>chaque seconde</b> : la <b>température CPU</b> est lue directement sur le matériel, le <b>ventilateur</b> est décrit à la fois par sa vitesse de rotation mesurée (en RPM) et par la puissance qui lui est demandée (en pourcentage), et le graphe du bas retrace l'évolution récente de la température et de la vitesse. C'est la page à garder ouverte, ou à consulter de temps en temps, pour vérifier d'un coup d'œil que tout se passe comme prévu : elle est en lecture seule, tu ne peux rien y modifier par erreur, et tous les réglages se trouvent dans l'onglet Contrôle. Si le badge en haut à droite indique que la connexion au contrôleur est perdue, ce que tu vois ici n'est plus à jour.
              </>
            }
          >
            La <b>température CPU</b> est lue via la DLL ASUS et son niveau se lit autant à la couleur qu'au libellé : la jauge est <b>bleue</b> tant que la température reste sous 65° (« frais » sous 50°, « tiède » de 50° à 64°), <b>orange</b> et « chaud » de 65° à 79°, puis <b>rouge</b> et « critique » à partir de 80°. L'arc de la jauge se remplit sur une échelle de 0° à 100°. Dans la carte <b>Ventilateur</b>, les RPM sont la vitesse réellement mesurée par le capteur, alors que la <b>puissance</b> est la consigne envoyée au contrôleur, un signal PWM compris entre 0 et 255 converti en pourcentage : les deux peuvent différer quelques instants, le temps que l'hélice accélère ou ralentisse, car le contrôleur n'applique jamais un changement d'un seul coup mais par petites étapes. L'icône tourne proportionnellement à la puissance : immobile à 0 % et à environ trois tours par seconde à 100 %, une limite choisie pour que l'animation ne donne pas l'impression de tourner à l'envers. Le graphe retrace les <b>90 dernières secondes</b>, à raison d'un point par seconde : la ligne de température change de couleur selon sa hauteur, comme la jauge, et la ligne blanche montre la vitesse du ventilateur. Cet historique n'est conservé qu'en mémoire dans la fenêtre : il repart de zéro à chaque ouverture de l'application, et réduire la fenêtre dans la zone de notification ne l'interrompt pas. Quand la connexion avec le contrôleur est coupée, par exemple si celui-ci redémarre, l'application retente automatiquement de se reconnecter toutes les secondes et demie, sans que tu aies rien à faire, et le badge repasse au vert dès que les mesures reprennent.
          </InfoNote>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Thermometer className="size-4 text-muted-foreground" /> Température CPU
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center">
                <TempGauge temp={s?.temp_c ?? 0} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Wind className="size-4 text-muted-foreground" /> Ventilateur
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-center justify-center gap-4">
                <FanRotor percent={s?.percent ?? 0} className="size-20 text-foreground" />
                <div className="text-center">
                  <div className="font-mono text-2xl font-semibold tabular-nums">
                    {s?.rpm ?? 0}
                    <span className="ml-1 text-xs text-muted-foreground">RPM</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Puissance <span className="font-mono text-foreground">{s?.percent ?? 0}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-xs">Dernières 90 secondes</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <HistoryChart history={fan.history} />
            </CardContent>
          </Card>
          </div>
          </ScrollArea></div>
        </TabsContent>

        <TabsContent value="control" className="relative">
          <Tabs defaultValue="pilotage" orientation="vertical" className="absolute inset-0">
            <TabsList>
              <TabsTrigger value="pilotage">
                <Gauge /> Pilotage
              </TabsTrigger>
              <TabsTrigger value="profils">
                <ListChecks /> Profils
              </TabsTrigger>
              <TabsTrigger value="reglages">
                <Settings2 /> Réglages
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pilotage" className="relative">
              <div className="absolute inset-0">
                <ScrollArea className="h-full">
                  <div className="flex min-h-full flex-col pr-3">
                    <PilotageTab
                      status={s}
                      profiles={fan.profiles}
                      onAuto={fan.setAuto}
                      onManual={fan.setManual}
                      onStop={fan.stop}
                      onSelectProfile={fan.selectProfile}
                    />
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
            <TabsContent value="profils" className="relative">
              <div className="absolute inset-0">
                <ScrollArea className="h-full">
                  <div className="flex min-h-full flex-col pr-3">
                    <ProfilesTab
                      profiles={fan.profiles}
                      status={s}
                      onActivate={fan.selectProfile}
                      onSave={fan.saveProfile}
                      onDelete={fan.deleteProfile}
                    />
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
            <TabsContent value="reglages" className="relative">
              <div className="absolute inset-0">
                <ScrollArea className="h-full">
                  <div className="flex min-h-full flex-col pr-3">
                    <SettingsTab
                      curveMode={s?.curve_mode ?? "steep"}
                      onCurveMode={fan.setCurveMode}
                    />
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="logs" className="relative">
          <div className="absolute inset-0">
            <LogsTab />
          </div>
        </TabsContent>

        <TabsContent value="about" className="relative">
          <div className="absolute inset-0">
            <AboutTab />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
