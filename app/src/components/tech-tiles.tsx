import { useTranslation } from "react-i18next"

// IMPORTANT : logos Simple Icons (CC0) copiés dans assets/tech, donc embarqués dans l'application : la page s'affiche
// à l'identique hors ligne. Le nom du fichier est le « slug » de la techno.
const ICONS = import.meta.glob<string>("../assets/tech/*.svg", { eager: true, query: "?url", import: "default" })
const iconUrl = (slug: string) => ICONS[`../assets/tech/${slug}.svg`]

interface Tech {
  name: string
  slug: string
  /** Couleur de la marque ; sans couleur, le logo prend celle du texte (marques noires). */
  color?: string
  spin?: boolean
}

interface TechGroup {
  /** Clé de traduction du titre et du texte (about.tech.<key>). */
  key: string
  items: Tech[]
}

const GROUPS: TechGroup[] = [
  {
    key: "interface",
    items: [
      { name: "React 19", slug: "react", color: "#61DAFB", spin: true },
      { name: "TypeScript", slug: "typescript", color: "#3178C6" },
      { name: "Vite", slug: "vite", color: "#9135FF" },
      { name: "Tailwind CSS 4", slug: "tailwindcss", color: "#06B6D4" },
      { name: "shadcn/ui", slug: "shadcnui" },
    ],
  },
  {
    key: "desktop",
    items: [
      { name: "Tauri 2", slug: "tauri", color: "#24C8D8" },
      { name: "Rust", slug: "rust" },
    ],
  },
  {
    key: "controller",
    items: [{ name: "Go", slug: "go", color: "#00ADD8" }],
  },
  {
    key: "hardware",
    items: [
      { name: "ASUS", slug: "asus" },
      { name: "NVIDIA", slug: "nvidia", color: "#76B900" },
    ],
  },
  {
    key: "builtWith",
    items: [{ name: "Claude Code", slug: "claudecode", color: "#D97757" }],
  },
]

/** Une tuile : le logo sert de masque, ce qui permet de le colorer avec la couleur de la marque. */
function Tile({ tech, index }: { tech: Tech; index: number }) {
  return (
    <div
      className="tech-tile"
      title={tech.name}
      data-spin={tech.spin ? "" : undefined}
      style={{ "--i": index, "--c": tech.color ?? "var(--foreground)" } as React.CSSProperties}
    >
      <div className="tech-box">
        <div className="tech-logo" style={{ "--src": `url("${iconUrl(tech.slug)}")` } as React.CSSProperties} />
      </div>
      <span className="text-muted-foreground">{tech.name}</span>
    </div>
  )
}

/** Technologies regroupées par domaine, chaque techno est une tuile animée (flottement, reflet et rotation au survol). */
export function TechTiles() {
  const { t } = useTranslation()
  let index = 0
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {GROUPS.map((g) => (
        <div key={g.key} className="rounded-none border bg-muted/30 p-3">
          <h3 className="font-semibold">{t(`about.tech.${g.key}.title`)}</h3>
          <p className="mb-3 mt-0.5 text-muted-foreground">{t(`about.tech.${g.key}.text`)}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((t) => (
              <Tile key={t.slug} tech={t} index={index++} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
