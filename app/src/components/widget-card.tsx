import { PictureInPicture2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { updatePrefs, usePrefs } from "@/lib/prefs"
import { isTauri } from "@/lib/tauri"

/** Opacités proposées au repos, en %. */
const OPACITIES = [30, 55, 80]

/** Réglages du mini-widget flottant (voir WidgetView) : affichage, opacité au repos et mode « clic traversant ». */
export function WidgetCard() {
  const { t } = useTranslation()
  const { widget } = usePrefs()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          <PictureInPicture2 className="size-4 text-muted-foreground" /> {t("widget.title")}
        </CardTitle>
        <CardDescription>{t("widget.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-none border p-3">
          <Label htmlFor="widget-enabled" className="flex flex-col items-start gap-1">
            <span className="font-medium">{t("widget.enable")}</span>
            <span className="font-normal leading-relaxed text-muted-foreground">{isTauri ? t("widget.hint") : t("config.onlyInstalled")}</span>
          </Label>
          <Switch id="widget-enabled" checked={widget.enabled} disabled={!isTauri} onCheckedChange={(v) => updatePrefs("widget", { enabled: v })} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-none border p-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t("widget.opacity")}</span>
            <span className="leading-relaxed text-muted-foreground">{t("widget.opacityHint")}</span>
          </div>
          <div className="flex gap-1.5">
            {OPACITIES.map((o) => (
              <Button key={o} size="sm" variant={widget.opacity === o ? "default" : "outline"} disabled={!isTauri} onClick={() => updatePrefs("widget", { opacity: o })}>
                {o} %
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-none border p-3">
          <Label htmlFor="widget-clickthrough" className="flex flex-col items-start gap-1">
            <span className="font-medium">{t("widget.clickThrough")}</span>
            <span className="font-normal leading-relaxed text-muted-foreground">{t("widget.clickThroughHint")}</span>
          </Label>
          <Switch id="widget-clickthrough" checked={widget.clickThrough} disabled={!isTauri} onCheckedChange={(v) => updatePrefs("widget", { clickThrough: v })} />
        </div>
      </CardContent>
    </Card>
  )
}
