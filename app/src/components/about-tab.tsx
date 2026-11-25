import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { useTranslation } from "react-i18next"
import { AboutInfoCard } from "@/components/about-info-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TechTiles } from "@/components/tech-tiles"
import { ScrollArea } from "@/components/ui/scroll-area"
import baridiIcon from "@/assets/baridi-icon.png"
import { isTauri } from "@/lib/tauri"

const CONTACT = "mirantohrs@gmail.com"
// Repli hors Tauri (navigateur de dev) : doit rester aligné sur package.json et tauri.conf.json.
const FALLBACK_VERSION = "2.0.0"

/** Page « À propos » : présentation, version, technologies et copyright. */
export function AboutTab() {
  const { t } = useTranslation()
  const [version, setVersion] = useState(FALLBACK_VERSION)

  useEffect(() => {
    if (!isTauri) return
    getVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  return (
    <div className="h-full">
      <ScrollArea className="h-full">
        <div className="flex min-h-full flex-col gap-4 pr-3">
          <Card>
            <CardContent className="flex items-center gap-5">
              <img src={baridiIcon} alt="" className="size-20 shrink-0 rounded-none" />
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight">Baridi - Fancontroller</h2>
                <p className="text-muted-foreground">{t("about.tagline")}</p>
                <Badge variant="secondary">{t("about.version", { version })}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs">{t("about.whatTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>
                {t("about.what")}
              </p>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-xs">{t("about.technologies")}</CardTitle>
            </CardHeader>
            <CardContent>
              <TechTiles />
            </CardContent>
          </Card>

          <AboutInfoCard />

          <p className="pb-1 text-center text-muted-foreground">
            {t("about.footer", { year: new Date().getFullYear() })}{" "}
            <a href={`mailto:${CONTACT}`} className="text-foreground underline-offset-4 hover:underline">
              {CONTACT}
            </a>
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}
