/**
 * Progreso del miembro hacia los premios del club (Tarjeta del Club del menú).
 *
 * Funciones puras: la barra tiene un hito por premio, una escala que muestra
 * el próximo premio con aire (no la lista completa, que aplastaría los hitos
 * cuando hay un premio caro) y la frase que acompaña al saldo.
 */

export interface RewardLike {
  _id: string
  name: string
  pointsCost: number
}

export type MilestoneState = 'done' | 'next' | 'far'

export interface Milestone {
  id: string
  name: string
  cost: number
  /** Posición en la barra, 0–100. */
  left: number
  state: MilestoneState
}

export interface ClubProgress {
  /** Próximo premio todavía no alcanzado; null si alcanza para todos. */
  next: RewardLike | null
  /** Puntos que representa el 100 % de la barra. */
  scale: number
  /** Relleno de la barra, 0–100. */
  pct: number
  /** Cantidad de premios que el saldo ya alcanza. */
  available: number
  /** Puntos que faltan para el próximo premio (0 si no hay próximo). */
  missing: number
  milestones: Milestone[]
}

export function computeClubProgress(points: number, rewards: RewardLike[]): ClubProgress {
  const pts = Math.max(0, points || 0)
  const sorted = rewards
    .filter(r => Number.isFinite(r.pointsCost) && r.pointsCost > 0)
    .sort((a, b) => a.pointsCost - b.pointsCost)

  if (sorted.length === 0) {
    return { next: null, scale: 0, pct: 0, available: 0, missing: 0, milestones: [] }
  }

  const max = sorted[sorted.length - 1].pointsCost
  const next = sorted.find(r => r.pointsCost > pts) ?? null
  // El próximo premio queda a dos tercios de la barra (×1.5), nunca más allá
  // del premio más caro, y al menos al doble del más barato para que el primer
  // hito no quede pegado al borde izquierdo.
  const scale = next
    ? Math.min(max, Math.max(next.pointsCost * 1.5, sorted[0].pointsCost * 2))
    : max
  const pct = scale > 0 ? Math.min(100, (pts / scale) * 100) : 0
  const available = sorted.filter(r => r.pointsCost <= pts).length

  const milestones: Milestone[] = []
  for (const r of sorted) {
    if (r.pointsCost > scale) break
    const left = (r.pointsCost / scale) * 100
    const state: MilestoneState = r.pointsCost <= pts ? 'done' : next && r._id === next._id ? 'next' : 'far'
    // Un hito lejano pegado al borde derecho se superpone con el final de la barra.
    if (state === 'far' && left > 98.5) continue
    milestones.push({ id: r._id, name: r.name, cost: r.pointsCost, left: Math.min(left, 97), state })
  }

  return { next, scale, pct, available, missing: next ? next.pointsCost - pts : 0, milestones }
}

export const formatPoints = (n: number) => Math.round(n).toLocaleString('es-AR')

/** Frase bajo el saldo. Devuelve partes para poder resaltar los datos clave. */
export function clubProgressMessage(p: ClubProgress): { strong: string; rest: string } {
  if (!p.next) {
    return { strong: 'Tenés puntos para cualquier premio.', rest: 'Elegí el tuyo y sumalo al pedido.' }
  }
  const falta = `Te faltan ${formatPoints(p.missing)} pts para ${p.next.name}.`
  if (p.available > 0) {
    return {
      strong: `Ya podés canjear ${p.available} ${p.available === 1 ? 'premio' : 'premios'}.`,
      rest: falta,
    }
  }
  return { strong: falta, rest: 'Cada compra te acerca.' }
}
