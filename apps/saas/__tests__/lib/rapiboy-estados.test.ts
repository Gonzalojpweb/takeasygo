// Estados de Rapiboy (catálogo /v1/LastMile/Estados) → fases del viaje →
// estado del pedido, sin retrocesos ni duplicados.
import { describe, it, expect } from 'vitest'
import { isPhaseAdvance, nextOrderStatus, rapiboyPhase } from '@/lib/rapiboy/estados'
import { applyTripState, shouldSyncTrip } from '@/lib/rapiboy/trips'
import { recotizarParaReady } from '@/lib/delivery/cotizar'
import { vi } from 'vitest'

vi.mock('@/lib/rapiboy/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rapiboy/client')>()),
  cotizarOnDemand: vi.fn(async () => ({ precio: 5200, vigencia: 3 })),
}))

describe('rapiboyPhase', () => {
  it('11 es ir AL LOCAL y 12 es Retirado (no «llegó al cliente»)', () => {
    expect(rapiboyPhase(10)).toBe('searching')
    expect(rapiboyPhase(11)).toBe('to_pickup')
    expect(rapiboyPhase(28)).toBe('at_store')
    expect(rapiboyPhase(12)).toBe('picked_up')
    expect(rapiboyPhase(29)).toBe('at_customer')
    expect(rapiboyPhase(13)).toBe('delivered')
  })
  it('fallas y cancelaciones', () => {
    for (const e of [16, 23, 43]) expect(rapiboyPhase(e)).toBe('failed')
    for (const e of [14, 20]) expect(rapiboyPhase(e)).toBe('cancelled')
    expect(rapiboyPhase(15)).toBeNull() // no existe en el catálogo
    expect(rapiboyPhase(31)).toBeNull() // EnRevision: sin efecto
  })
})

describe('nextOrderStatus', () => {
  it('solo avanza', () => {
    expect(nextOrderStatus('ready', 'picked_up')).toBe('en_ruta')
    expect(nextOrderStatus('en_ruta', 'at_customer')).toBe('arrived')
    expect(nextOrderStatus('arrived', 'picked_up')).toBeNull()
    expect(nextOrderStatus('delivered', 'picked_up')).toBeNull()
  })
  it('buscar repartidor o ir al local no cambian el pedido', () => {
    expect(nextOrderStatus('ready', 'searching')).toBeNull()
    expect(nextOrderStatus('ready', 'to_pickup')).toBeNull()
  })
  it('un viaje fallido o cancelado NO cancela el pedido de comida', () => {
    expect(nextOrderStatus('en_ruta', 'failed')).toBeNull()
    expect(nextOrderStatus('ready', 'cancelled')).toBeNull()
  })
  it('un pedido cancelado no revive', () => {
    expect(nextOrderStatus('cancelled', 'delivered')).toBeNull()
  })
})

describe('isPhaseAdvance', () => {
  it('terminal nunca se pisa; no retrocede', () => {
    expect(isPhaseAdvance(null, 'searching')).toBe(true)
    expect(isPhaseAdvance('picked_up', 'to_pickup')).toBe(false)
    expect(isPhaseAdvance('delivered', 'picked_up')).toBe(false)
    expect(isPhaseAdvance('at_customer', 'failed')).toBe(true)
  })
})

function makeOrder(overrides: any = {}) {
  return {
    _id: 'o1',
    status: 'ready',
    statusTimestamps: {} as Record<string, Date>,
    deliveryConfirmation: null as any,
    deliveryProvider: { type: 'rapiboy', rapiboy: { tripId: '900001', estado: 10, phase: 'searching', driverName: '', trackingUrl: '' } },
    ...overrides,
  }
}

describe('applyTripState', () => {
  it('Retirado pasa el pedido a en_ruta con timestamp y guarda el repartidor', () => {
    const o = makeOrder()
    const r = applyTripState(o, { estado: 12, driverName: 'Carlos' })
    expect(r).toMatchObject({ changed: true, phase: 'picked_up', newStatus: 'en_ruta' })
    expect(o.status).toBe('en_ruta')
    expect(o.statusTimestamps.enRutaAt).toBeInstanceOf(Date)
    expect(o.deliveryProvider.rapiboy).toMatchObject({ estado: 12, estadoNombre: 'Retirado', phase: 'picked_up', driverName: 'Carlos' })
  })

  it('el mismo estado dos veces no cambia nada (aviso duplicado)', () => {
    const o = makeOrder()
    applyTripState(o, { estado: 12 })
    const again = applyTripState(o, { estado: 12 })
    expect(again.changed).toBe(false)
  })

  it('un aviso atrasado no hace retroceder', () => {
    const o = makeOrder()
    applyTripState(o, { estado: 13 })
    expect(o.status).toBe('delivered')
    const late = applyTripState(o, { estado: 12 })
    expect(late.changed).toBe(false)
    expect(o.status).toBe('delivered')
    expect(o.deliveryProvider.rapiboy.phase).toBe('delivered')
  })

  it('NoEntregado marca el viaje fallido y deja el pedido como estaba', () => {
    const o = makeOrder({ status: 'en_ruta' })
    const r = applyTripState(o, { estado: 16 })
    expect(r).toMatchObject({ changed: true, phase: 'failed', newStatus: null })
    expect(o.status).toBe('en_ruta')
  })
})

describe('shouldSyncTrip', () => {
  it('solo viajes activos y como mucho una vez por minuto', () => {
    const now = Date.now()
    expect(shouldSyncTrip(makeOrder(), now)).toBe(true)
    const recent = makeOrder()
    ;(recent.deliveryProvider.rapiboy as any).lastSyncAt = new Date(now - 10_000)
    expect(shouldSyncTrip(recent, now)).toBe(false)
    expect(shouldSyncTrip(makeOrder({ status: 'delivered' }), now)).toBe(false)
    const done = makeOrder()
    done.deliveryProvider.rapiboy.phase = 'failed'
    expect(shouldSyncTrip(done, now)).toBe(false)
    expect(shouldSyncTrip({ ...makeOrder(), deliveryProvider: { type: 'own' } }, now)).toBe(false)
  })
})

describe('recotizarParaReady', () => {
  const base = {
    origen: { lat: -34.58, lng: -58.39 },
    destino: { lat: -34.6, lng: -58.38 },
    rapiboyConfig: { apiToken: 'x', environment: 'uat' as const, codigoPlataforma: '', enabled: true, margen: 20 },
    transferBuffer: 0,
    paymentMethod: 'mercadopago',
  }

  it('si el costo nuevo (5200) sube sobre lo cubierto (5000), pide aceptación aunque haya margen', async () => {
    const r = await recotizarParaReady({ ...base, checkoutCost: 5000, paidByCustomer: 6000 })
    expect(r.action).toBe('pending_accept')
    expect(r.chargedToCustomer).toBe(6000)
  })

  it('si baja, crea el viaje y la diferencia con lo pagado es para TakeasyGO', async () => {
    const r = await recotizarParaReady({ ...base, checkoutCost: 5500, paidByCustomer: 6600 })
    expect(r.action).toBe('create_trip')
    expect(r.chargedToCustomer - r.newCost).toBe(1400)
  })
})
