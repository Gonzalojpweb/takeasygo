/**
 * lib/onboarding-journey.ts
 *
 * Resolución de hitos, progreso goal-gradient, ETA y copy dinámico.
 * Puro (sin mongoose) para testeable.
 *
 * Semántica: todas las funciones reciben "hitos completados" (0‑7).
 */

/** Los 7 hitos del viaje "TGO" del usuario. */
export const JOURNEY = [
  { key: 'datos',          label: 'Datos del negocio',    hint: 'Nombre, slug y email del restaurante', phase: 'A' },
  { key: 'email',          label: 'Verificá tu email',    hint: 'Llegó a tu bandeja (revistá Spam si no aparece)', phase: 'A' },
  { key: 'clave',          label: 'Creá tu clave',        hint: 'Contraseña segura de 8+ dígitos',          phase: 'A' },
  { key: 'plan',           label: 'Plan elegido',         hint: 'Trial 30 días sin cargo o Plan con cargo', phase: 'B' },
  { key: 'sede',           label: 'Sede',                 hint: 'Dirección y tipo de comida',               phase: 'B' },
  { key: 'identidad',      label: 'Identidad visual',     hint: 'Color principal y branding',               phase: 'B' },
  { key: 'revision',       label: 'Revisión',             hint: 'Enviado al equipo, pronto listo',          phase: 'B' },
] as const

/** Pesos goal‑gradient: los primeros pasos valen 1, los últimos valen más. */
const WEIGHTS = [1, 1, 1.5, 2, 2.5, 3, 4] // suma = 15

/** Minutos estimados por hito (hitos 1‑3 livianos = 2 min, plan/sede/identidad pesados). */
const ETA_STEPS = [2, 2, 2, 4, 4, 4, 2]

/** Progress % = (suma pesos alcanzados / suma total pesos) * 100, con piso 6 %. */
export function progressFor(reached: number): number {
  const reachedWeight = WEIGHTS.slice(0, reached).reduce((a, b) => a + b, 0)
  const base = Math.round((reachedWeight / WEIGHTS.reduce((a, b) => a + b, 0)) * 100)
  return Math.max(base, 6) // piso visual: la barra nunca queda vacía
}

/** Cuántos hitos faltan. */
export function remaining(reached: number): number {
  return 7 - reached
}

/** ETA en minutos para completar los primeros `reached` hitos (acumulado). */
export function etaMinutes(reached: number): number {
  return ETA_STEPS.slice(0, reached).reduce((a, b) => a + b, 0)
}

/** Copy dinámico según hitos pendientes. */
export function copyFor(reached: number): string {
  const faltan = remaining(reached)
  if (faltan <= 0) return '¡Listo!'
  if (faltan === 1) return 'Te queda 1 paso'
  return `Te quedan ${faltan} pasos`
}

/** Devuelve el label + hint del hito actual dado el índice global (1‑based). */
export function currentHito(globalIdx: number): { label: string; hint: string } | null {
  if (globalIdx < 1 || globalIdx > 7) return null
  return { label: JOURNEY[globalIdx - 1].label, hint: JOURNEY[globalIdx - 1].hint }
}

/** Convierte un paso local de fase A (1‑3) al índice global (1‑3). */
export function phaseAIndex(localStep: number): number {
  return localStep
}

/** Convierte un step server de fase B (3‑7) al índice global. */
export function phaseBIndex(serverStep: number): number {
  return serverToGlobal(serverStep)
}

/** Mapeo step server → índice global (identidad: 1‑7). */
const SERVER_TO_JOURNEY: Record<number, number> = {
  1: 1, // Datos
  2: 2, // Email
  3: 3, // Clave (fase A completa; el wizard B muestra Plan)
  4: 4, // Plan
  5: 5, // Sede
  6: 6, // Identidad
  7: 7, // Revisión
}

/** Convierte un step server (1‑7) al índice global (1‑based). */
export function serverToGlobal(step: number): number {
  return SERVER_TO_JOURNEY[step] ?? 0
}

/** Convierte un índice global al step server. */
export function globalToServer(idx: number): number {
  return SERVER_TO_JOURNEY[idx] ? idx : 1
}
