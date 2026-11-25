import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "@/i18n"
import App from "./App.tsx"
import { WidgetView } from "@/components/widget-view"

// La même application sert deux fenêtres : la principale, et le mini-widget (?widget=1, voir tauri.conf.json).
const isWidget = new URLSearchParams(window.location.search).has("widget")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isWidget ? <WidgetView /> : <App />}
  </StrictMode>,
)
