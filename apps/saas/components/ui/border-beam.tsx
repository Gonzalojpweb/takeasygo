"use client"

import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface BorderBeamProps {
  /** Color principal del haz. */
  colorFrom?: string
  /** Color de la cola del haz. */
  colorTo?: string
  /** Segundos por vuelta. */
  duration?: number
  /** Grosor del borde en px. */
  borderWidth?: number
  className?: string
}

/**
 * Haz de luz que recorre el borde del contenedor (Magic UI BorderBeam).
 * Se apoya en el padre: necesita `position: relative` y un `border-radius`.
 * Versión CSS (conic-gradient + máscara) para no cargar motion en el menú.
 */
export function BorderBeam({
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  duration = 1.4,
  borderWidth = 1.5,
  className,
}: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("mask-border animate-beam-spin pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={
        {
          padding: borderWidth,
          "--beam-duration": `${duration}s`,
          background: `conic-gradient(from var(--beam-angle), transparent 0 62%, ${colorFrom} 80%, ${colorTo} 88%, transparent 100%)`,
        } as CSSProperties
      }
    />
  )
}
