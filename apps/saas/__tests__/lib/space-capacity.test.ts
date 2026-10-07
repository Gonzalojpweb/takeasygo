import { describe, it, expect } from 'vitest'
import {
  blocksOverlap,
  getActiveSpaces,
  getDayCapacity,
  getMaxSpaceCapacity,
  getSeatsState,
  isSpacesMode,
  normalizeSpacesInput,
  occupiedSeats,
  occupiedSeatsForSpace,
  overlappingReservations,
  validateSpacesInput,
  type ReservationSpace,
} from '@/lib/space-capacity'

const DAY = '2026-10-07'
const OTHER_DAY = '2026-10-11'

function space(overrides: Partial<ReservationSpace> = {}): ReservationSpace {
  return {
    name: 'Salón',
    capacity: 10,
    enabled: true,
    blockedDates: [],
    order: 0,
    ...overrides,
  }
}

function reservation(time: string, partySize: number) {
  return { time, partySize }
}

describe('detección de modo espacios', () => {
  it('lista vacía o ausente = sin espacios (modo clásico)', () => {
    expect(isSpacesMode([])).toBe(false)
    expect(isSpacesMode(undefined)).toBe(false)
    expect(isSpacesMode(null)).toBe(false)
  })

  it('con al menos un espacio = modo espacios', () => {
    expect(isSpacesMode([space()])).toBe(true)
  })

  it('una sede sin spaces no calcula aforo: getSeatsState queda inerte', () => {
    const state = getSeatsState({
      spaces: [],
      date: DAY,
      time: '13:00',
      blockDurationMinutes: 90,
      reservations: [reservation('13:00', 8)],
    })
    expect(state).toEqual({
      spacesMode: false,
      capacity: 0,
      occupied: 0,
      remaining: 0,
      maxSpaceCapacity: 0,
    })
  })
})

describe('capacidad del día', () => {
  it('suma la capacidad de todos los espacios habilitados', () => {
    const spaces = [space({ name: 'Salón', capacity: 2 }), space({ name: 'Terraza', capacity: 10, order: 1 })]
    expect(getDayCapacity(spaces, DAY)).toBe(12)
  })

  it('un espacio deshabilitado no aporta capacidad', () => {
    const spaces = [space({ capacity: 2 }), space({ name: 'Terraza', capacity: 10, enabled: false, order: 1 })]
    expect(getDayCapacity(spaces, DAY)).toBe(2)
    expect(getActiveSpaces(spaces, DAY)).toHaveLength(1)
  })

  it('una fecha bloqueada saca al espacio sólo ese día', () => {
    const spaces = [space({ capacity: 8, blockedDates: [DAY] })]
    expect(getDayCapacity(spaces, DAY)).toBe(0)
    expect(getDayCapacity(spaces, OTHER_DAY)).toBe(8)
  })

  it('todos los espacios fuera de servicio ese día = capacidad 0', () => {
    const spaces = [space({ capacity: 5, enabled: false }), space({ capacity: 5, blockedDates: [DAY], order: 1 })]
    expect(getDayCapacity(spaces, DAY)).toBe(0)
    expect(getMaxSpaceCapacity(spaces, DAY)).toBe(0)
  })
})

describe('grupo mayor al espacio más grande', () => {
  it('toma la capacidad del espacio habilitado más grande', () => {
    const spaces = [space({ capacity: 2 }), space({ name: 'Terraza', capacity: 10, order: 1 })]
    expect(getMaxSpaceCapacity(spaces, DAY)).toBe(10)
  })

  it('el más grande deshabilitado no cuenta', () => {
    const spaces = [space({ capacity: 2 }), space({ name: 'Terraza', capacity: 10, enabled: false, order: 1 })]
    expect(getMaxSpaceCapacity(spaces, DAY)).toBe(2)
  })

  it('state.remaining refleja el lugar que queda para el grupo', () => {
    const spaces = [space({ capacity: 10 })]
    const state = getSeatsState({
      spaces,
      date: DAY,
      time: '13:00',
      blockDurationMinutes: 90,
      reservations: [reservation('13:30', 6)],
    })
    expect(state.capacity).toBe(10)
    expect(state.occupied).toBe(6)
    expect(state.remaining).toBe(4)
    expect(state.maxSpaceCapacity).toBe(10)
  })
})

describe('2 y 10 comensales pesan distinto', () => {
  it('misma cantidad de reservas, distinto ocupado según el grupo', () => {
    const spaces = [space({ capacity: 10 })]
    const base = { spaces, date: DAY, time: '13:00', blockDurationMinutes: 90 }

    const two = getSeatsState({ ...base, reservations: [reservation('13:00', 2)] })
    const ten = getSeatsState({ ...base, reservations: [reservation('13:00', 10)] })

    expect(two.occupied).toBe(2)
    expect(ten.occupied).toBe(10)
    expect(two.remaining).toBe(8)
    expect(ten.remaining).toBe(0)
  })

  it('acumula el partySize de todas las reservas que solapan', () => {
    const occupied = occupiedSeats(
      [reservation('13:00', 4), reservation('13:30', 3), reservation('15:30', 10)],
      '13:00',
      90
    )
    // 13:00-14:30 y 13:30-15:00 solapan; 15:30-17:00 no.
    expect(occupied).toBe(7)
  })
})

describe('solapamiento de bloques', () => {
  it('bloques que se tocan en el borde no solapan', () => {
    const overlapping = overlappingReservations([reservation('14:30', 2)], '13:00', 90)
    expect(overlapping).toHaveLength(0)
  })

  it('bloque que empieza un minuto antes del fin sí solapa', () => {
    const overlapping = overlappingReservations([reservation('14:29', 2)], '13:00', 90)
    expect(overlapping).toHaveLength(1)
  })

  it('una reserva posterior al bloque no lo ocupa', () => {
    const overlapping = overlappingReservations([reservation('16:00', 2)], '13:00', 90)
    expect(overlapping).toHaveLength(0)
  })

  it('blocksOverlap es simétrico y abierto por la derecha', () => {
    expect(blocksOverlap(0, 90, 90, 180)).toBe(false)
    expect(blocksOverlap(90, 180, 0, 90)).toBe(false)
    expect(blocksOverlap(0, 90, 89, 180)).toBe(true)
    expect(blocksOverlap(89, 180, 0, 90)).toBe(true)
  })

  it('los bloques se calculan con la duración configurada, no con la hora pedida', () => {
    // Reserva a las 13:00 con bloque de 150 min llega hasta 15:30.
    const overlapping = overlappingReservations([reservation('13:00', 2)], '15:29', 150)
    expect(overlapping).toHaveLength(1)
  })
})

describe('ocupación por espacio elegido (spaceId)', () => {
  const S_SALON = '65f1c0a1b2c3d4e5f6a7b8c1'
  const S_TERRAZA = '65f1c0a1b2c3d4e5f6a7b8c2'
  const spaces: ReservationSpace[] = [
    space({ _id: S_SALON, name: 'Salón', capacity: 2 }),
    space({ _id: S_TERRAZA, name: 'Terraza', capacity: 10, order: 1 }),
  ]
  const BASE = { date: DAY, time: '13:00', blockDurationMinutes: 90 }

  function reserved(time: string, partySize: number, spaceId?: string) {
    return { time, partySize, spaceId }
  }

  it('occupiedSeatsForSpace sólo suma las reservas de ese espacio', () => {
    const rows = [
      reserved('13:00', 4, S_SALON),
      reserved('13:30', 5, S_TERRAZA),
      reserved('13:00', 3), // sin espacio asignado
    ]
    expect(occupiedSeatsForSpace(rows, S_SALON, '13:00', 90)).toBe(4)
    expect(occupiedSeatsForSpace(rows, S_TERRAZA, '13:00', 90)).toBe(5)
  })

  it('las reservas sin espacio no ocupan al espacio elegido', () => {
    const rows = [reserved('13:00', 8)]
    expect(occupiedSeatsForSpace(rows, S_SALON, '13:00', 90)).toBe(0)
  })

  it('getSeatsState con spaceId mide el espacio, no la suma del día', () => {
    const state = getSeatsState({
      ...BASE,
      spaces,
      reservations: [reserved('13:00', 5, S_TERRAZA), reserved('13:00', 2, S_SALON)],
      spaceId: S_TERRAZA,
    })
    expect(state.capacity).toBe(10)
    expect(state.occupied).toBe(5)
    expect(state.remaining).toBe(5)
    expect(state.maxSpaceCapacity).toBe(10)
  })

  it('espacio deshabilitado → capacidad 0 aunque tenga reservas', () => {
    const state = getSeatsState({
      ...BASE,
      spaces: [spaces[0], { ...spaces[1], enabled: false }],
      reservations: [reserved('13:00', 3, S_TERRAZA)],
      spaceId: S_TERRAZA,
    })
    expect(state.capacity).toBe(0)
    expect(state.remaining).toBe(0)
  })

  it('fecha bloqueada del espacio elegido → capacidad 0 sólo ese día', () => {
    const blocked = getSeatsState({
      ...BASE,
      spaces: [spaces[0], { ...spaces[1], blockedDates: [DAY] }],
      reservations: [],
      spaceId: S_TERRAZA,
    })
    expect(blocked.capacity).toBe(0)

    const otherDay = getSeatsState({
      ...BASE,
      date: OTHER_DAY,
      spaces: [spaces[0], { ...spaces[1], blockedDates: [DAY] }],
      reservations: [],
      spaceId: S_TERRAZA,
    })
    expect(otherDay.capacity).toBe(10)
    expect(otherDay.remaining).toBe(10)
  })

  it('sin spaceId sigue midiendo el aforo total del día', () => {
    const state = getSeatsState({
      ...BASE,
      spaces,
      reservations: [reserved('13:00', 5, S_TERRAZA), reserved('13:00', 2, S_SALON)],
    })
    expect(state.capacity).toBe(12)
    expect(state.occupied).toBe(7)
    expect(state.remaining).toBe(5)
    expect(state.maxSpaceCapacity).toBe(10)
  })
})

describe('validateSpacesInput', () => {
  it('payload válido → null', () => {
    expect(validateSpacesInput([space()])).toBeNull()
    expect(validateSpacesInput([])).toBeNull()
  })

  it('no ser lista → error', () => {
    expect(validateSpacesInput('salón')).toMatch(/lista/i)
    expect(validateSpacesInput({ name: 'Salón' })).toMatch(/lista/i)
  })

  it('espacio sin nombre → error', () => {
    expect(validateSpacesInput([{ ...space(), name: '   ' }])).toMatch(/necesita un nombre/)
    expect(validateSpacesInput([null])).toMatch(/no es válido/)
  })

  it('capacidad no entera o menor a 1 → error', () => {
    expect(validateSpacesInput([{ ...space(), capacity: 0 }])).toMatch(/entero mayor o igual a 1/)
    expect(validateSpacesInput([{ ...space(), capacity: 2.5 }])).toMatch(/entero mayor o igual a 1/)
    expect(validateSpacesInput([{ ...space(), capacity: '10' }])).toMatch(/entero mayor o igual a 1/)
    expect(validateSpacesInput([{ ...space(), capacity: NaN }])).toMatch(/entero mayor o igual a 1/)
  })

  it('fecha bloqueada que no es calendario real → error', () => {
    expect(validateSpacesInput([{ ...space(), blockedDates: ['2026-02-31'] }])).toMatch(/Fecha inválida/)
    expect(validateSpacesInput([{ ...space(), blockedDates: ['mañana'] }])).toMatch(/Fecha inválida/)
  })

  it('blockedDates que no es lista → error', () => {
    expect(validateSpacesInput([{ ...space(), blockedDates: '2026-10-07' }])).toMatch(/deben ser una lista/)
  })

  it('enabled que no es booleano → error', () => {
    expect(validateSpacesInput([{ ...space(), enabled: 'si' }])).toMatch(/verdadero o falso/)
  })

  it('demasiados espacios → error', () => {
    const many = Array.from({ length: 51 }, (_, i) => space({ name: `Espacio ${i}` }))
    expect(validateSpacesInput(many)).toMatch(/Máximo 50/)
  })
})

describe('normalizeSpacesInput', () => {
  it('aplica defaults de enabled, blockedDates y order', () => {
    const normalized = normalizeSpacesInput([
      { name: '  Salón  ', capacity: 6 },
      { name: 'Terraza', capacity: 4, enabled: false, blockedDates: [DAY], order: 7 },
    ])
    expect(normalized).toEqual([
      { name: 'Salón', capacity: 6, enabled: true, blockedDates: [], order: 0 },
      { name: 'Terraza', capacity: 4, enabled: false, blockedDates: [DAY], order: 7 },
    ])
  })

  it('preserva el _id válido de subdocumento para que no cambie en cada guardado', () => {
    const id = '65f1c0a1b2c3d4e5f6a7b8c9'
    const normalized = normalizeSpacesInput([{ _id: id, name: 'Salón', capacity: 6 }])
    expect(normalized[0]._id).toBe(id)
  })

  it('descarta un _id inválido en lugar de romper el cast de ObjectId', () => {
    const normalized = normalizeSpacesInput([
      { _id: 'no-es-un-objectid', name: 'Salón', capacity: 6 },
      { _id: 12345, name: 'Terraza', capacity: 4 },
    ])
    expect(normalized[0]._id).toBeUndefined()
    expect(normalized[1]._id).toBeUndefined()
    expect(normalized).toEqual([
      { name: 'Salón', capacity: 6, enabled: true, blockedDates: [], order: 0 },
      { name: 'Terraza', capacity: 4, enabled: true, blockedDates: [], order: 1 },
    ])
  })
})
