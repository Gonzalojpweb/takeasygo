// Hora corregida y vencimiento de piezas (endsAt) — también sin internet.
//
// La hora del equipo puede estar mal (TV Box sin pila, zona horaria rota).
// Cada respuesta del servidor trae su hora (serverTime o el encabezado Date):
// se guarda la diferencia y se usa para decidir qué está vigente. Sin
// internet se usa la última diferencia conocida (persistida).

const OFFSET_KEY = 'tgd:clock-offset'

export interface ClockOffset { offsetMs: number; measuredAt: number }

/** Diferencia servidor − equipo, compensando la mitad del viaje de ida y vuelta. */
export function computeOffset(serverMs: number, sentAt: number, receivedAt: number): number {
  const midpoint = sentAt + (receivedAt - sentAt) / 2
  return Math.round(serverMs - midpoint)
}

export function saveOffset(o: ClockOffset, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(OFFSET_KEY, JSON.stringify(o)) } catch { /* sin almacenamiento */ }
}

export function loadOffset(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ClockOffset | null {
  try {
    const raw = storage?.getItem(OFFSET_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as ClockOffset
    return Number.isFinite(o?.offsetMs) ? o : null
  } catch {
    return null
  }
}

/** Hora corregida (ms). Sin diferencia conocida, la del equipo. */
export function correctedNow(deviceNow = Date.now(), offset: ClockOffset | null = loadOffset()): number {
  return deviceNow + (offset?.offsetMs ?? 0)
}

export interface Schedulable { startsAt?: string | null; endsAt?: string | null }

/** ¿Se puede mostrar ahora? Empezó (o no tiene inicio) y no venció (o no tiene fin). */
export function isActiveAt(item: Schedulable, nowMs: number): boolean {
  const start = item.startsAt ? Date.parse(item.startsAt) : NaN
  const end = item.endsAt ? Date.parse(item.endsAt) : NaN
  if (Number.isFinite(start) && nowMs < start) return false
  if (Number.isFinite(end) && nowMs >= end) return false
  return true
}

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}
