import { describe, it, expect } from 'vitest'
import { isPromoActiveToday, isPromoInTimeWindow, isPromoScheduledNow, localDayMinutes } from '@/lib/promo-schedule'

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
    expect(isPromoScheduledNow({ scheduledEnd: new Date('2026-11-08T23:00:00Z') }, undefined, domingo2130AR)).toBe(false)
  })
})
