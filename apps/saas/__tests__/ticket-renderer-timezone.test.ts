import { describe, it, expect, afterAll } from 'vitest'
import { renderOrderTicket } from '@/lib/printing/ticket-renderer'
import { buildPreCloseBuffer, type PreCloseData } from '@/lib/preclose-report'

// El bug: el renderer formateaba las fechas sin timeZone → Node usaba el TZ
// del proceso (UTC en Vercel) y el ticket salía +3h desfasado. Forzamos UTC
// para que el test falle si el renderer vuelve a formatear sin timeZone,
// incluso corriendo en una máquina con TZ Argentina.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'UTC'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const AR_TZ = 'America/Argentina/Buenos_Aires'
const CREATED_AT = '2026-10-08T23:30:00.000Z' // 20:30 en AR
const PICKUP_AT = '2026-10-08T23:00:00.000Z' // 20:00 en AR

const printer = {
  _id: 'p1',
  name: 'Cocina',
  paperWidth: 80,
  roles: ['kitchen'],
}

type RenderOrder = Parameters<typeof renderOrderTicket>[0]
type RenderPrinter = Parameters<typeof renderOrderTicket>[1]

const baseOrder = {
  _id: 'o1',
  orderNumber: 'TEST-001',
  status: 'confirmed',
  items: [
    { name: 'Coca Cola', basePrice: 1000, price: 1000, quantity: 1, subtotal: 1000 },
  ],
  total: 1000,
  createdAt: CREATED_AT,
}

function decode(buf: Buffer): string {
  return buf.toString('latin1')
}

// ICU formatea es-AR en 12h con "p. m." (con NBSP), y el encoder del ticket
// convierte ese NBSP en 0xFF. Normalizamos todo el whitespace/0xFF para
// comparar el contenido sin depender del codepage ni del formato 12/24h.
function norm(s: string): string {
  return s.replace(/[\s\u00a0\u00ff]+/g, '')
}

const arTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: AR_TZ })
const utcTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

describe('ticket-renderer — fechas en timezone de la sede', () => {
  it('imprime la Fecha en la zona de la sede, no en UTC', () => {
    const buf = renderOrderTicket(
      { ...baseOrder, location: { locationName: 'Local Test', timezone: AR_TZ } } as unknown as RenderOrder,
      printer as unknown as RenderPrinter,
      'kitchen'
    )
    expect(buf).toBeTruthy()
    const text = decode(buf!)
    const expected = new Date(CREATED_AT).toLocaleString('es-AR', { timeZone: AR_TZ })
    expect(text).toContain(`Fecha: ${expected}`)
    expect(text).not.toContain('23:30')
  })

  it('imprime el PROGRAMADO en la zona de la sede', () => {
    const buf = renderOrderTicket(
      {
        ...baseOrder,
        orderTiming: 'scheduled',
        scheduledPickupAt: PICKUP_AT,
        location: { locationName: 'Local Test', timezone: AR_TZ },
      } as unknown as RenderOrder,
      printer as unknown as RenderPrinter,
      'kitchen'
    )
    const text = decode(buf!)
    const expectedTime = new Date(PICKUP_AT).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: AR_TZ,
    })
    const expectedDate = new Date(PICKUP_AT).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: AR_TZ,
    })
    expect(norm(text)).toContain(norm(`PROGRAMADO: ${expectedDate} ${expectedTime} hs`))
    // Con TZ=UTC forzado, el bug hubiese impreso la hora UTC (23:00 AR → 11 PM)
    expect(norm(text)).not.toContain(norm(utcTime(PICKUP_AT)))
    expect(norm(text)).toContain(norm(arTime(PICKUP_AT)))
  })

  it('sin timezone en la sede cae al default AR', () => {
    const buf = renderOrderTicket(
      { ...baseOrder, location: { locationName: 'Local Test' } } as unknown as RenderOrder,
      printer as unknown as RenderPrinter,
      'kitchen'
    )
    const text = decode(buf!)
    const expected = new Date(CREATED_AT).toLocaleString('es-AR', { timeZone: AR_TZ })
    expect(text).toContain(`Fecha: ${expected}`)
  })
})

describe('preclose-report — fechas en timezone de la sede', () => {
  const base: PreCloseData = {
    locationName: 'Local Test',
    timezone: AR_TZ,
    from: '2026-10-08T03:00:00.000Z',
    to: '2026-10-09T02:59:59.999Z',
    generatedAt: CREATED_AT,
    totalOrders: 0,
    totalRevenue: 0,
    totalNetRevenue: 0,
    totalSurcharge: 0,
    avgTicket: 0,
    avgTicketNet: 0,
    topItems: [],
    promoCount: 0,
    promoItemsSold: 0,
    totalDiscounts: 0,
    deliveryCount: 0,
    deliveryCosts: 0,
    deliveryRevenue: 0,
    takeawayCount: 0,
    takeawayRevenue: 0,
    dineinCount: 0,
    dineinRevenue: 0,
    cancelledCount: 0,
    cancelledAmount: 0,
    paymentApproved: 0,
    paymentPending: 0,
    paymentRejected: 0,
    paymentMethodBreakdown: [],
  }

  it('imprime la hora del cierre en la zona de la sede', () => {
    const b64 = buildPreCloseBuffer(base)
    const text = Buffer.from(b64, 'base64').toString('latin1')
    expect(norm(text)).toContain(norm(`Hora: ${arTime(CREATED_AT)}`))
    // Con TZ=UTC forzado, el bug hubiese impreso la hora UTC
    expect(norm(text)).not.toContain(norm(`Hora: ${utcTime(CREATED_AT)}`))
  })

  it('sin timezone cae al default AR', () => {
    const b64 = buildPreCloseBuffer({ ...base, timezone: undefined })
    const text = Buffer.from(b64, 'base64').toString('latin1')
    expect(norm(text)).toContain(norm(`Hora: ${arTime(CREATED_AT)}`))
    expect(norm(text)).not.toContain(norm(`Hora: ${utcTime(CREATED_AT)}`))
  })
})
