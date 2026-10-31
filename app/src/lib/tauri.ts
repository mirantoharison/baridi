import { invoke } from "@tauri-apps/api/core"

/** Vrai uniquement dans la fenêtre Tauri (pas dans un navigateur de dev ou de test). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Appelle une commande Rust ; rejette si on n'est pas dans Tauri. */
export function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return Promise.reject(new Error("Disponible uniquement dans l'application Tauri"))
  return invoke<T>(command, args)
}
