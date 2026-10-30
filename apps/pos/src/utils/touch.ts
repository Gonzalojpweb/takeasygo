import type { KeyboardEvent } from "react"

/** Pantalla táctil sin mouse: el teclado es el de pantalla. */
export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
}

/**
 * Obs. UX 30/10: en una búsqueda que filtra mientras se escribe, «Buscar» del
 * teclado de pantalla solo tiene que cerrarlo para dejar ver los resultados.
 */
export function closeKeyboardOnEnter(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key === "Enter" && isCoarsePointer()) e.currentTarget.blur()
}
