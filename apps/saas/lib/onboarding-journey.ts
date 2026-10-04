/**
 * lib/onboarding-journey.ts
 *
 * Resolución de hitos, progreso goal-gradient, ETA y copy dinámico.
 * Puro (sin mongoose) para testeable.
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

/** ETA en minutos: asume 2 min por hito ligero y 4 min por hito pesado. */
export function etaMinutes(reached: number): number {
  const light = [1, 2] // datos, email
  const heavy = [3, 4, 5, 6, 7] // resto
  const lightDone = light.filter(i => i <= reached).length
  const heavyDone = heavy.filter(i => i <= reached).length
  const minutes = lightDone * 2 + heavyDone * 4
  return minutes
}

/** Copy dinámico según hitos pendientes. */
export function copyFor(reached: number): string {
  const faltan = remaining(reached)
  if (faltan <= 0) return '¡Listo!'
  if (faltan === 1) return 'Te queda 1 paso'
  if (faltan <= 3) return `Te quedan ${faltan} pasos`
  return `Te quedan ${faltan} pasos`
}

/** Devuelve el label + hint del hito actual dado el índice global (1‑based). */
export function currentHito(globalIdx: number): { label: string; hint: string } | null {
  if (globalIdx < 1 || globalIdx > 7) return null
  return { label: JOURNEY[globalIdx - 1].label, hint: JOURNEY[globalIdx - 1].hint }
}

/** Convierte un paso local de fase A (1‑3) al índice global (1‑3). */
export function phaseAIndex(localStep: 1 | 2 | 3): number {
  return localStep
}

/** Convierte un step server (1‑7) al índice global (1‑based). */
const SERVER_TO_JOURNEY: Record<number, number> = {
  1: 1, // Datos
  2: 2, // Email
  3: 3, // Clave → done al setear step=3, pero el hito "clave" se muestra en fase A; server 3 ya pasa a Plan
  4: 4, // Plan
  5: 5, // Sede
  5: 5, // Sede
  6: 6, // Identidad
  7: 7, // Revisión
}

/** Convierte un índice global al step server. */
const JOURNEY_TO_SERVER: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
}

/** Devuelve el label + hint del hito actual dado el índice global (1‑based). */
export function currentHito(globalIdx: number): { label: string; hint: string } | null {
  if (globalIdx < 1 || globalIdx > 7) return null
  return { label: JOURNEY[globalIdx - 1].label, hint: JOURNEY[globalIdx - 1].hint }
}

/** Convierte un paso local de fase A (1‑3) al índice global (1‑3). */
export function phaseAIndex(localStep: 1 | 2 | 3): number {
  return localStep
}

/** Convierte un step server (1‑7) al índice global (1‑based). */
export function serverToGlobal(step: number): number {
  return SERVER_TO_JOURNEY[step] ?? 0
}

/** Convierte un índice global al step server. */
export function globalToServer(idx: number): number {
  return JOURNEY_TO_SERVER[idx] ?? 1
}