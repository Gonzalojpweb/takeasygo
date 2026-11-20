import { describe, it, expect } from 'vitest'
import { isPromoActiveToday, isPromoInTimeWindow, isPromoScheduledNow, isPromoWithinDates, localDayMinutes } from '@/lib/promo-schedule'

// Instantes en UTC, como los ve el servidor de Vercel. Argentina = UTC−3.
// Domingo 08/11/2026 21:30 en Argentina = lunes 09/11/2026 00:30 UTC.
const domingo2130AR = new Date('2026-11-09T00:30:00Z')
const domingo1300AR = new Date('2026-11-08T16:00:00Z')

describe('promos en la hora de la sede, no la del servidor (UTC)', () => {
  it('a las 21:30 de Argentina sigue siendo domingo y 21:30', () => {
    expect(localDayMinutes(domingo2130AR)).toEqual({ day: 0, minutes: 21 * 60 + 30 })
  })

  it('una promo de 11 a 23 h sigue visible a las 21:30 (antes desaparecía)', () => {
    expect(isPromoInTimeWindow('11:00', '23:00', domingo2130AR)).toBe(true)
  })

  it('una promo solo de domingos sigue visible el domingo a la noche', () => {
    expect(isPromoActiveToday([0], undefined, domingo2130AR)).toBe(true)
    expect(isPromoActiveToday([1], undefined, domingo2130AR)).toBe(false)
  })

  it('ventana que cruza la medianoche (20:00 → 02:00)', () => {
    expect(isPromoInTimeWindow('20:00', '02:00', domingo2130AR)).toBe(true)
    expect(isPromoInTimeWindow('20:00', '02:00', new Date('2026-11-09T04:30:00Z'))).toBe(true) // 01:30 AR
    expect(isPromoInTimeWindow('20:00', '02:00', domingo1300AR)).toBe(false)
  })

  it('fuera de horario se oculta', () => {
    expect(isPromoInTimeWindow('11:00', '15:00', domingo2130AR)).toBe(false)
  })

  it('respeta la zona horaria de la sede y cae en Argentina si es inválida', () => {
    // 00:30 UTC en Madrid (UTC+1) = 01:30 del lunes
    expect(localDayMinutes(domingo2130AR, 'Europe/Madrid')).toEqual({ day: 1, minutes: 90 })
    expect(localDayMinutes(domingo2130AR, 'Zona/Inventada')).toEqual({ day: 0, minutes: 21 * 60 + 30 })
  })

  it('sin horarios o con horario mal cargado no se oculta', () => {
    expect(isPromoInTimeWindow(null, null, domingo2130AR)).toBe(true)
    expect(isPromoInTimeWindow('xx', '23:00', domingo2130AR)).toBe(true)
  })

  it('isPromoScheduledNow (checkout) usa la misma regla', () => {
    expect(isPromoScheduledNow({ activeDays: [0], activeTimeStart: '11:00', activeTimeEnd: '23:00' }, undefined, domingo2130AR)).toBe(true)
    expect(isPromoScheduledNow({ scheduledEnd: new Date('2026-11-08T23:00:00Z') }, undefined, domingo2130AR)).toBe(false) // con hora: se respeta
  })
})

describe('fechas «desde/hasta» sin hora (caso Que Cachapa)', () => {
  // Panel: desde 07/11 hasta 08/11 → guardado como medianoche UTC.
  const promo = { scheduledStart: '2026-11-07T00:00:00.000Z', scheduledEnd: '2026-11-08T00:00:00.000Z', activeDays: [0, 6], activeTimeStart: '00:00', activeTimeEnd: '23:59' }

  it('«hasta el 08/11» vale todo el 8 en Argentina (antes vencía el 7 a las 21 h)', () => {
    expect(isPromoWithinDates(promo, undefined, domingo2130AR)).toBe(true)
    expect(isPromoScheduledNow(promo, undefined, domingo2130AR)).toBe(true)
  })

  it('vence a las 23:59 del día de fin', () => {
    expect(isPromoWithinDates(promo, undefined, new Date('2026-11-09T02:58:00Z'))).toBe(true) // 23:58 AR
    expect(isPromoWithinDates(promo, undefined, new Date('2026-11-09T03:01:00Z'))).toBe(false) // 00:01 del 9
  })

  it('«desde el 07/11» arranca a las 00:00 del 7 en Argentina', () => {
    expect(isPromoWithinDates(promo, undefined, new Date('2026-11-07T02:59:00Z'))).toBe(false) // 23:59 del 6
    expect(isPromoWithinDates(promo, undefined, new Date('2026-11-07T03:01:00Z'))).toBe(true)  // 00:01 del 7
  })
})

// ── 20/11/2026: horas en 12/24 h, una sola hora, días + medianoche ──────────
import {
  describePromoDays,
  describePromoHours,
  formatTime12,
  normalizeTimeOfDay,
  sanitizePromoScheduleInput,
} from '@/lib/promo-schedule'

// Instante en Argentina (UTC−3) para un día/hora dados de la semana del 16/11/2026 (lunes 16).
const ar = (isoLocal: string) => new Date(`${isoLocal}-03:00`)

describe('horas escritas en 12 h o 24 h', () => {
  it('normaliza a HH:MM', () => {
    expect(normalizeTimeOfDay('18:30')).toBe('18:30')
    expect(normalizeTimeOfDay('6:30 pm')).toBe('18:30')
    expect(normalizeTimeOfDay('6:30 p. m.')).toBe('18:30')
    expect(normalizeTimeOfDay('6 PM')).toBe('18:00')
    expect(normalizeTimeOfDay('18hs')).toBe('18:00')
    expect(normalizeTimeOfDay('9.15')).toBe('09:15')
    expect(normalizeTimeOfDay('12 am')).toBe('00:00')
    expect(normalizeTimeOfDay('12 pm')).toBe('12:00')
    expect(normalizeTimeOfDay('11:59 p.m.')).toBe('23:59')
  })
  it('rechaza lo que no es una hora', () => {
    expect(normalizeTimeOfDay('25:00')).toBeNull()
    expect(normalizeTimeOfDay('13 pm')).toBeNull()
    expect(normalizeTimeOfDay('18:75')).toBeNull()
    expect(normalizeTimeOfDay('tarde')).toBeNull()
  })
  it('muestra la versión de 12 h', () => {
    expect(formatTime12('18:30')).toBe('6:30 p. m.')
    expect(formatTime12('00:15')).toBe('12:15 a. m.')
  })
  it('la promo guardada en 12 h se evalúa igual', () => {
    expect(isPromoInTimeWindow('6 pm', '11 pm', ar('2026-11-16T20:00'))).toBe(true)
    expect(isPromoInTimeWindow('6 pm', '11 pm', ar('2026-11-16T17:59'))).toBe(false)
  })
})

describe('días sin hora = día entero; con hora = esa franja', () => {
  const lunAMie = { activeDays: [1, 2, 3] }
  it('lunes a miércoles sin hora: todo el día esos días, nada el jueves', () => {
    expect(isPromoScheduledNow(lunAMie, undefined, ar('2026-11-16T00:01'))).toBe(true) // lunes 00:01
    expect(isPromoScheduledNow(lunAMie, undefined, ar('2026-11-18T23:59'))).toBe(true) // miércoles 23:59
    expect(isPromoScheduledNow(lunAMie, undefined, ar('2026-11-19T00:01'))).toBe(false) // jueves
    expect(isPromoScheduledNow(lunAMie, undefined, ar('2026-11-15T12:00'))).toBe(false) // domingo
  })
  it('con franja 18 a 23: arranca a las 18 y termina a las 23 (fin exclusivo)', () => {
    const p = { ...lunAMie, activeTimeStart: '18:00', activeTimeEnd: '23:00' }
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-17T17:59'))).toBe(false)
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-17T18:00'))).toBe(true)
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-17T22:59'))).toBe(true)
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-17T23:00'))).toBe(false)
  })
  it('solo «desde»: hasta el final del día; solo «hasta»: desde las 00:00', () => {
    expect(isPromoInTimeWindow('18:00', null, ar('2026-11-17T23:58'))).toBe(true)
    expect(isPromoInTimeWindow('18:00', '', ar('2026-11-17T17:00'))).toBe(false)
    expect(isPromoInTimeWindow(null, '15:00', ar('2026-11-17T09:00'))).toBe(true)
    expect(isPromoInTimeWindow('', '15:00', ar('2026-11-17T15:30'))).toBe(false)
  })
  it('noche que cruza la medianoche: la madrugada cuenta para el día en que empezó', () => {
    const p = { ...lunAMie, activeTimeStart: '20:00', activeTimeEnd: '02:00' }
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-19T01:00'))).toBe(true) // jueves 01:00 = noche del miércoles
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-16T01:00'))).toBe(false) // lunes 01:00 = noche del domingo
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-16T21:00'))).toBe(true) // lunes 21:00
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-19T21:00'))).toBe(false) // jueves 21:00
  })
  it('fechas + días + horas juntas', () => {
    const p = { ...lunAMie, activeTimeStart: '12:00', activeTimeEnd: '15:00', scheduledStart: '2026-11-17T00:00:00.000Z', scheduledEnd: '2026-11-18T00:00:00.000Z' }
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-16T13:00'))).toBe(false) // lunes: antes del inicio
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-17T13:00'))).toBe(true)
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-18T13:00'))).toBe(true) // «hasta el 18» incluye el 18
    expect(isPromoScheduledNow(p, undefined, ar('2026-11-18T16:00'))).toBe(false) // fuera de hora
  })
})

describe('textos y validación del panel', () => {
  it('resumen en lenguaje simple', () => {
    expect(describePromoDays([1, 2, 3])).toBe('lunes a miércoles')
    expect(describePromoDays([5, 6, 0])).toBe('viernes a domingo')
    expect(describePromoDays([1, 3])).toBe('lunes y miércoles')
    expect(describePromoDays([])).toBe('todos los días')
    expect(describePromoHours(null, null)).toBe('todo el día')
    expect(describePromoHours('18:00', '23:00')).toBe('de 18:00 a 23:00')
    expect(describePromoHours('18:00', '')).toBe('desde las 18:00')
    expect(describePromoHours('20:00', '02:00')).toBe('de 20:00 a 02:00 (del día siguiente)')
  })
  it('guardar: normaliza horas y rechaza lo inválido', () => {
    const data: Record<string, unknown> = { activeTimeStart: '6:30 pm', activeTimeEnd: '', activeDays: [3, 1, 1] }
    expect(sanitizePromoScheduleInput(data)).toBeNull()
    expect(data).toMatchObject({ activeTimeStart: '18:30', activeTimeEnd: null, activeDays: [1, 3] })
    expect(sanitizePromoScheduleInput({ activeTimeStart: 'tarde' })).toMatch(/inicio inválida/)
    expect(sanitizePromoScheduleInput({ scheduledStart: '2026-11-20', scheduledEnd: '2026-11-10' })).toMatch(/anterior/)
  })
})
