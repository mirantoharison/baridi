import { useEffect, useState } from "react"

/** Relit une donnée du contrôleur à intervalle régulier tant que le composant est affiché ; null avant la première réponse. */
export function usePolled<T>(fetcher: () => Promise<T>, intervalMs: number): T | null {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    let isMounted = true
    const load = () =>
      fetcher()
        .then((d) => isMounted && setData(d))
        .catch(() => {
          /* contrôleur indisponible ou trop ancien pour cette route : on garde la dernière valeur connue */
        })
    load()
    const timer = setInterval(load, intervalMs)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [fetcher, intervalMs])
  return data
}
