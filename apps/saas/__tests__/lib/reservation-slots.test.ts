import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/models/Reservation', () => ({
  default: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}))

vi.mock('@/models/Location', () => ({ default: {} }))

import { generateReservationSlots } from '@/lib/reservation-slots'

// 2026-10-07 12:00 en America/Argentina/Buenos_Aires (miércoles)
const NOON_AR = new Date('2026-10-07T15:00:00.000Z')
const TODAY = '2026-10-07'
const YESTERDAY = '2026-10-06'
const TOMORROW = '2026-10-08'
const AR = 'America/Argentina/Buenos_Aires'

type SlotConfig = {
  enabled: boolean
  operatingHours: Array<{ days: number[]; open: string; close: string }>
  slotIntervalMinutes: number
  blockDurationMinutes: number
  maxReservationsPerSlot: number
}

type ConfigOverrides = {
  enabled?: boolean
  minPayment?: number
  timeSlots?: string[]
  maxPartySize?: number | null
  minAdvanceMinutes?: number | null
  slotConfig?: Partial<SlotConfig>
}

type TestConfig = {
  enabled: boolean
  minPayment: number
  timeSlots: string[]
  maxPartySize: number | null
  minAdvanceMinutes: number | null
  slotConfig: SlotConfig
}

function autoConfig(overrides: ConfigOverrides = {}): TestConfig {
  return {
    enabled: true,
    minPayment: 0,
    timeSlots: ['09:00', '12:00', '12:15', '12:30', '23:00'],
    maxPartySize: 10,
    slotConfig: {
      enabled: true,
      operatingHours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '23:00' }],
      slotIntervalMinutes: 30,
      blockDurationMinutes: 90,
      maxReservationsPerSlot: 1,
    },
    ...overrides,
  }
}

function manualConfig(overrides: ConfigOverrides = {}): TestConfig {
  return {
    enabled: true,
    minPayment: 0,
    timeSlots: ['09:00', '12:30', '18:00'],
    maxPartySize: 10,
    slotConfig: { enabled: false, operatingHours: [] },
    ...overrides,
  }
}

function times(result: { slots: Array<{ time: string }> }): string[] {
  return result.slots.map(s => s.time)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fechas pasadas', () => {
  it('fecha anterior a hoy → dayOpen:false y sin slots', async () => {
    const result = await generateReservationSlots('loc1', YESTERDAY, autoConfig(), {
      timezone: AR,
      now: NOON_AR,
    })
    expect(result).toEqual({ date: YESTERDAY, dayOpen: false, slots: [] })
  })

  it('lo mismo en modo manual', async () => {
    const result = await generateReservationSlots('loc1', YESTERDAY, manualConfig(), {
      timezone: AR,
      now: NOON_AR,
    })
    expect(result.dayOpen).toBe(false)
    expect(result.slots).toEqual([])
  })
})

describe('modo automático — corte por antelación', () => {
  it('hoy con antelación 30: arranca en 12:30 y no ofrece 12:00 ni 09:00', async () => {
    const result = await generateReservationSlots('loc1', TODAY, autoConfig(), {
      timezone: AR,
      minAdvanceMinutes: 30,
      now: NOON_AR,
    })
    const all = times(result)
    expect(all[0]).toBe('12:30')
    expect(all).not.toContain('09:00')
    expect(all).not.toContain('12:00')
    expect(all).not.toContain('12:15')
    expect(result.dayOpen).toBe(true)
  })

  it('el corte es inclusivo: 12:30 está, 12:15 no', async () => {
    const result = await generateReservationSlots(
      'loc1',
      TODAY,
      autoConfig({ slotConfig: { ...autoConfig().slotConfig, slotIntervalMinutes: 15 } }),
      { timezone: AR, minAdvanceMinutes: 30, now: NOON_AR }
    )
    const all = times(result)
    expect(all).toContain('12:30')
    expect(all).not.toContain('12:15')
    expect(all).not.toContain('12:00')
  })

  it('mañana no se corta: el rango completo está disponible', async () => {
    const result = await generateReservationSlots('loc1', TOMORROW, autoConfig(), {
      timezone: AR,
      minAdvanceMinutes: 30,
      now: NOON_AR,
    })
    const all = times(result)
    expect(all[0]).toBe('09:00')
    expect(all).toContain('12:30')
    expect(result.slots).toHaveLength(28) // 09:00 a 22:30 cada 30 min
  })
})

describe('modo manual', () => {
  it('hoy: no emite los horarios que ya pasaron', async () => {
    const result = await generateReservationSlots(
      'loc1',
      TODAY,
      manualConfig({ timeSlots: ['09:00', '12:00', '12:15', '12:30', '18:00'] }),
      { timezone: AR, minAdvanceMinutes: 30, now: NOON_AR }
    )
    expect(times(result)).toEqual(['12:30', '18:00'])
    expect(result.dayOpen).toBe(true)
  })

  it('mañana: emite todos los timeSlots', async () => {
    const result = await generateReservationSlots('loc1', TOMORROW, manualConfig(), {
      timezone: AR,
      minAdvanceMinutes: 30,
      now: NOON_AR,
    })
    expect(times(result)).toEqual(['09:00', '12:30', '18:00'])
  })

  it('sin timeSlots → dayOpen:false', async () => {
    const result = await generateReservationSlots('loc1', TODAY, manualConfig({ timeSlots: [] }), {
      timezone: AR,
      minAdvanceMinutes: 30,
      now: NOON_AR,
    })
    expect(result).toEqual({ date: TODAY, dayOpen: false, slots: [] })
  })

  it('caen a manual si slotConfig.enabled pero operatingHours vacías', async () => {
    const result = await generateReservationSlots(
      'loc1',
      TOMORROW,
      autoConfig({ slotConfig: { enabled: true, operatingHours: [] } }),
      { timezone: AR, minAdvanceMinutes: 30, now: NOON_AR }
    )
    expect(times(result)).toEqual(['09:00', '12:00', '12:15', '12:30', '23:00'])
  })
})

describe('timezone de la sede', () => {
  it('usa la tz de la sede para saber qué día es hoy', async () => {
    // NOON_AR: en AR es 2026-10-07, en Tokio ya es 2026-10-08.
    // Si el corte se calculara con UTC o con la tz del servidor,
    // 2026-10-07 parecería "hoy" y devolvería slots.
    const pastDay = await generateReservationSlots('loc1', TODAY, autoConfig(), {
      timezone: 'Asia/Tokyo',
      minAdvanceMinutes: 30,
      now: NOON_AR,
    })
    expect(pastDay.dayOpen).toBe(false)
    expect(pastDay.slots).toEqual([])

    const todayTokyo = await generateReservationSlots('loc1', TOMORROW, autoConfig(), {
      timezone: 'Asia/Tokyo',
      minAdvanceMinutes: 30,
      now: NOON_AR,
    })
    expect(todayTokyo.dayOpen).toBe(true)
    expect(times(todayTokyo)[0]).toBe('09:00')
  })
})

describe('casos borde documentados', () => {
  it('close <= open (horario que cruza la medianoche) → 0 slots: no está soportado', async () => {
    const result = await generateReservationSlots(
      'loc1',
      TOMORROW,
      autoConfig({
        slotConfig: {
          enabled: true,
          operatingHours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '23:00', close: '09:00' }],
          slotIntervalMinutes: 30,
          blockDurationMinutes: 90,
          maxReservationsPerSlot: 1,
        },
      }),
      { timezone: AR, minAdvanceMinutes: 30, now: NOON_AR }
    )
    expect(result).toEqual({ date: TOMORROW, dayOpen: false, slots: [] })
  })

  it('cutoff > 1440 (23:50 + 30 min) → no queda ningún slot', async () => {
    const almostMidnight = new Date('2026-10-08T02:50:00.000Z') // 2026-10-07 23:50 AR
    const auto = await generateReservationSlots('loc1', TODAY, autoConfig(), {
      timezone: AR,
      minAdvanceMinutes: 30,
      now: almostMidnight,
    })
    expect(auto).toEqual({ date: TODAY, dayOpen: false, slots: [] })

    const manual = await generateReservationSlots('loc1', TODAY, manualConfig(), {
      timezone: AR,
      minAdvanceMinutes: 30,
      now: almostMidnight,
    })
    expect(manual.slots).toEqual([])
  })

  it('el día de la semana de operatingHours se evalúa en la tz de la sede', async () => {
    // 2026-10-10 15:00 UTC → en AR es sábado 2026-10-10 12:00;
    // en Tokio es domingo 2026-10-11 00:00.
    const now = new Date('2026-10-10T15:00:00.000Z')
    const sundayOnly = autoConfig({
      slotConfig: {
        enabled: true,
        operatingHours: [{ days: [0], open: '09:00', close: '23:00' }],
        slotIntervalMinutes: 30,
        blockDurationMinutes: 90,
        maxReservationsPerSlot: 1,
      },
    })

    const inAr = await generateReservationSlots('loc1', '2026-10-10', sundayOnly, {
      timezone: AR,
      minAdvanceMinutes: 30,
      now,
    })
    expect(inAr.dayOpen).toBe(false)

    const inTokyo = await generateReservationSlots('loc1', '2026-10-11', sundayOnly, {
      timezone: 'Asia/Tokyo',
      minAdvanceMinutes: 30,
      now,
    })
    expect(inTokyo.dayOpen).toBe(true)
    expect(times(inTokyo)[0]).toBe('09:00')
  })
})

describe('minAdvanceMinutes en documentos viejos', () => {
  it('si el config no trae el campo, se usa el default 30', async () => {
    const legacy = autoConfig({
      slotConfig: {
        enabled: true,
        operatingHours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '23:00' }],
        slotIntervalMinutes: 15,
        blockDurationMinutes: 90,
        maxReservationsPerSlot: 1,
      },
    })
    delete (legacy as Partial<TestConfig>).minAdvanceMinutes

    const result = await generateReservationSlots('loc1', TODAY, legacy, {
      timezone: AR,
      now: NOON_AR,
    })
    const all = times(result)
    // Con default 30 el primero es 12:30; con 0 sería 12:15.
    expect(all[0]).toBe('12:30')
    expect(all).not.toContain('12:15')
  })

  it('opts.minAdvanceMinutes tiene prioridad sobre el config', async () => {
    const result = await generateReservationSlots(
      'loc1',
      TODAY,
      manualConfig({
        timeSlots: ['09:00', '12:15', '12:30', '18:00'],
        minAdvanceMinutes: 120,
      }),
      { timezone: AR, minAdvanceMinutes: 15, now: NOON_AR }
    )
    // Con 15 min (opts) el 12:15 entra; con 120 min (config) no entraría.
    const all = times(result)
    expect(all).toContain('12:15')
    expect(all).toContain('12:30')
    expect(all).toContain('18:00')
  })
})
