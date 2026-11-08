"use client"

import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface ShineBorderProps {
  /** Grosor del borde en px. */
  borderWidth?: number
  /** Segundos por ciclo del brillo. */
  duration?: number
  /** Uno o varios colores del brillo. */
  shineColor?: string | string[]
  className?: string
}

/**
 * Borde con brillo que se desplaza (Magic UI ShineBorder).
 * Se apoya en el padre: necesita `position: relative` y un `border-radius`.
 */
export function ShineBorder({
  borderWidth = 2,
  duration = 6,
  shineColor = "#000000",
  className,
}: ShineBorderProps) {
  const colors = Array.isArray(shineColor) ? shineColor.join(",") : shineColor
  return (
    <span
      aria-hidden="true"
      className={cn("mask-border animate-shine-border pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={
        {
          padding: borderWidth,
          "--shine-duration": `${duration}s`,
          backgroundImage: `radial-gradient(transparent, transparent, ${colors}, transparent, transparent)`,
          backgroundSize: "300% 300%",
        } as CSSProperties
      }
    />
  )
}
