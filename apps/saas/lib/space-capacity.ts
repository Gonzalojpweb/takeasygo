import { isValidCalendarDate, timeToMinutes } from '@/lib/restaurant-time'

export interface ReservationSpace {
  _id?: string
  name: string
  capacity: number
  enabled?: boolean
  blockedDates?: string[]
  order?: number
}

export interface OccupyingReservation {
  time: string
  partySize: number
}

/** Estados que ocupan lugar en el aforo de un día. */
export const ACTIVE_RESERVATION_STATUSES = ['pending_payment', 'confirmed'] as const

/** Un sin espacios (vacío o ausente) = modo clásico por maxReservationsPerSlot. */
export function isSpacesMode(spaces?: ReservationSpace[] | null): boolean {
  return Array.isArray(spaces) && spaces.length > 0
}

/** Espacios que cuentan ese día: habilitados y sin la fecha bloqueada. */
export function getActiveSpaces(
  spaces: ReservationSpace[] | null | undefined,
  date: string
): ReservationSpace[] {
  if (!isSpacesMode(spaces)) return []
  return spaces!.filter(
    s => s.enabled !== false && !(s.blockedDates ?? []).includes(date)
  )
}

export function getDayCapacity(
  spaces: ReservationSpace[] | null | undefined,
  date: string
): number {
  return getActiveSpaces(spaces, date).reduce((sum, s) => sum + (s.capacity || 0), 0)
}

/** Capacidad del espacio más grande habilitado ese día (0 si no hay ninguno). */
export function getMaxSpaceCapacity(
  spaces: ReservationSpace[] | null | undefined,
  date: string
): number {
  return getActiveSpaces(spaces, date).reduce(
    (max, s) => Math.max(max, s.capacity || 0),
    0
  )
}

/** Intervalos [aStart, aEnd) y [bStart, bEnd): tocarse en el borde no solapa. */
export function blocksOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function overlappingReservations(
  reservations: OccupyingReservation[],
  time: string,
  blockDurationMinutes: number
): OccupyingReservation[] {
  const start = timeToMinutes(time)
  const end = start + blockDurationMinutes
  return reservations.filter(r => {
    const rStart = timeToMinutes(r.time || '00:00')
    return blocksOverlap(start, end, rStart, rStart + blockDurationMinutes)
  })
}

export function occupiedSeats(
  reservations: OccupyingReservation[],
  time: string,
  blockDurationMinutes: number
): number {
  return overlappingReservations(reservations, time, blockDurationMinutes)
    .reduce((sum, r) => sum + (r.partySize || 0), 0)
}

export interface SeatsState {
  spacesMode: boolean
  capacity: number
  occupied: number
  remaining: number
  maxSpaceCapacity: number
}

export function getSeatsState(opts: {
  spaces?: ReservationSpace[] | null
  date: string
  time: string
  blockDurationMinutes: number
  reservations: OccupyingReservation[]
}): SeatsState {
  const spacesMode = isSpacesMode(opts.spaces)
  if (!spacesMode) {
    return { spacesMode: false, capacity: 0, occupied: 0, remaining: 0, maxSpaceCapacity: 0 }
  }
  const capacity = getDayCapacity(opts.spaces, opts.date)
  const occupied = occupiedSeats(
    opts.reservations,
    opts.time,
    opts.blockDurationMinutes
  )
  return {
    spacesMode: true,
    capacity,
    occupied,
    remaining: capacity - occupied,
    maxSpaceCapacity: getMaxSpaceCapacity(opts.spaces, opts.date),
  }
}

export const MAX_SPACES_PER_LOCATION = 50
const MAX_SPACE_NAME_LENGTH = 60

/**
 * Valida el payload de `Location.spaces` que llega por PUT.
 * Devuelve un mensaje de error listo para un 400, o null si está bien.
 */
export function validateSpacesInput(spaces: unknown): string | null {
  if (!Array.isArray(spaces)) {
    return 'Los espacios deben ser una lista'
  }
  if (spaces.length > MAX_SPACES_PER_LOCATION) {
    return `Máximo ${MAX_SPACES_PER_LOCATION} espacios por sede`
  }

  for (const [index, rawSpace] of spaces.entries()) {
    const space = rawSpace as Record<string, unknown> | null
    if (!space || typeof space !== 'object' || Array.isArray(space)) {
      return `El espacio #${index + 1} no es válido`
    }

    const name = typeof space.name === 'string' ? space.name.trim() : ''
    if (!name) {
      return `El espacio #${index + 1} necesita un nombre`
    }
    if (name.length > MAX_SPACE_NAME_LENGTH) {
      return `El nombre "${name}" es demasiado largo (máx. ${MAX_SPACE_NAME_LENGTH} caracteres)`
    }

    const capacity = space.capacity
    if (!Number.isInteger(capacity) || (capacity as number) < 1) {
      return `La capacidad de "${name}" debe ser un número entero mayor o igual a 1`
    }

    if ('enabled' in space && typeof space.enabled !== 'boolean') {
      return `El estado del espacio "${name}" debe ser verdadero o falso`
    }

    const blockedDates = space.blockedDates
    if (!Array.isArray(blockedDates)) {
      return `Las fechas bloqueadas de "${name}" deben ser una lista`
    }
    for (const date of blockedDates) {
      if (typeof date !== 'string' || !isValidCalendarDate(date)) {
        return `Fecha inválida en "${name}": "${String(date)}". Usar formato YYYY-MM-DD`
      }
    }
  }

  return null
}

/** Normaliza un payload ya validado (defaults de enabled/order/blockedDates). */
export function normalizeSpacesInput(
  spaces: Array<Record<string, unknown>>
): ReservationSpace[] {
  return spaces.map((space, index) => {
    // Preserva el _id de subdocumento si es válido, para que no cambie en cada save.
    const _id =
      typeof space._id === 'string' && /^[0-9a-fA-F]{24}$/.test(space._id)
        ? space._id
        : undefined
    return {
      ...(typeof _id === 'string' ? { _id } : {}),
      name: String(space.name ?? '').trim(),
      capacity: Number(space.capacity),
      enabled: space.enabled !== false,
      blockedDates: Array.isArray(space.blockedDates) ? (space.blockedDates as string[]) : [],
      order: Number.isInteger(space.order) ? Number(space.order) : index,
    }
  })
}
