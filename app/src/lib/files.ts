import { call, isTauri } from "@/lib/tauri"

/** Résultat d'un enregistrement : le chemin complet du fichier créé (dans Téléchargements). */
export interface SavedFile {
  path: string
}

/**
 * Enregistre un fichier texte dans le dossier Téléchargements (voir `save_text_file` côté Rust). Hors de l'application
 * installée (navigateur de développement), on déclenche un téléchargement du navigateur à la place.
 */
export async function saveTextFile(name: string, content: string): Promise<SavedFile> {
  if (isTauri) return { path: await call<string>("save_text_file", { name, content }) }
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return { path: name }
}

/** Affiche un fichier enregistré dans l'Explorateur Windows (sans effet hors de l'application installée). */
export function revealFile(path: string): Promise<void> {
  return isTauri ? call<void>("reveal_file", { path }) : Promise.resolve()
}

/** Lit le contenu texte d'un fichier choisi par l'utilisateur (import). */
export function readFileText(file: File): Promise<string> {
  return file.text()
}

/** Date du jour au format AAAA-MM-JJ, pour nommer les fichiers exportés. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
