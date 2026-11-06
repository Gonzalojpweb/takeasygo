import type { ItemCourse } from "@takeasygo/types"

// ============================================================================
// Tiempos de cocina: entrada → principal → postre (piloto 06/11/2026)
// ============================================================================
// El mozo comanda todo junto, pero la cocina no tiene que sacar el principal
// hasta que el mozo «marcha». Regla:
//   · Al comandar, los tiempos que vienen DESPUÉS del primero presente en la
//     ronda quedan EN ESPERA (entrada + principal ⇒ el principal espera).
//     El POS manda la lista explícita; el mozo puede destildarla.
//   · La comanda los imprime igual (la cocina va armando), con el encabezado
//     «EN ESPERA — esperar MARCHA».
//   · «Marcha principal» imprime solo «MARCHA PRINCIPAL» + mesa, sin repetir
//     los platos, y saca el tiempo de la espera.
// Los platos sin tiempo (bebidas, etc.) nunca esperan.
// ============================================================================

export const COURSE_SEQUENCE: readonly ItemCourse[] = ["entrada", "principal", "postre"]

export const COURSE_LABELS: Readonly<Record<ItemCourse, string>> = {
  entrada: "Entrada",
  principal: "Principal",
  postre: "Postre",
}

export function isItemCourse(value: unknown): value is ItemCourse {
  return typeof value === "string" && (COURSE_SEQUENCE as readonly string[]).includes(value)
}

/** Tiempos presentes en la ronda, en orden de salida. */
export function coursesPresent(items: readonly { course?: ItemCourse | null }[]): ItemCourse[] {
  return COURSE_SEQUENCE.filter((c) => items.some((i) => i.course === c))
}

/** Sugerencia al comandar: todo lo que viene después del primer tiempo presente. */
export function coursesToHold(items: readonly { course?: ItemCourse | null }[]): ItemCourse[] {
  return coursesPresent(items).slice(1)
}

/**
 * Valida la lista que manda el POS: solo tiempos presentes en la ronda, sin
 * repetir, en orden. Devuelve null si trae algo inválido.
 */
export function sanitizeHeldCourses(
  requested: unknown,
  items: readonly { course?: ItemCourse | null }[]
): ItemCourse[] | null {
  if (requested === undefined || requested === null) return []
  if (!Array.isArray(requested)) return null
  if (!requested.every(isItemCourse)) return null
  const present = new Set(coursesPresent(items))
  if (!requested.every((c) => present.has(c))) return null
  return COURSE_SEQUENCE.filter((c) => requested.includes(c))
}

/** El próximo tiempo a marchar (el primero en espera). */
export function nextCourseToFire(held: readonly ItemCourse[] | null | undefined): ItemCourse | null {
  return COURSE_SEQUENCE.find((c) => (held ?? []).includes(c)) ?? null
}
