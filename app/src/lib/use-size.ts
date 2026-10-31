import { useEffect, useRef, useState } from "react"

/**
 * Taille réelle (px) d'un conteneur. Permet de dessiner un SVG à l'échelle 1:1 :
 * sans ça, le viewBox étire aussi le texte et `text-xs` ne vaut plus 12px.
 */
export function useSize<T extends HTMLElement>(fallbackW: number, fallbackH: number) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: fallbackW, h: fallbackH })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth || fallbackW, h: el.clientHeight || fallbackH })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallbackW, fallbackH])
  return [ref, size.w, size.h] as const
}
