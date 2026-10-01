/**
 * __tests__/lib/compliance-alerts.test.ts
 *
 * Resolución de alertas de SLA:
 * - la cadena de estados y el criterio de "objetivo cumplido"
 * - findStaleAlerts: qué alertas se cierran solas al leer /compliance/status
 * - casos del bug original: pedido entregado, pedido cancelado, orden borrada
 */

import {
  STATUS_CHAIN,
  TERMINAL_STATUSES,
  statusIndex,
  isTerminalStatus,
  orderReachedTarget,
  isAlertStale,
  findStaleAlerts,
} from '@/lib/compliance-alerts'

describe('STATUS_CHAIN', () => {
  it('recorre el flujo de un pedido en orden', () => {
    expect(STATUS_CHAIN).toEqual([
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'en_ruta',
      'arrived',
      'delivered',
    ])
  })

  it('no tiene duplicados', () => {
    expect(new Set(STATUS_CHAIN).size).toBe(STATUS_CHAIN.length)
  })
})

describe('statusIndex', () => {
  it('devuelve la posición en la cadena', () => {
    expect(statusIndex('pending')).toBe(0)
    expect(statusIndex('arrived')).toBe(5)
    expect(statusIndex('delivered')).toBe(6)
  })

  it('devuelve -1 para estados fuera del flujo SLA', () => {
    expect(statusIndex('awaiting_payment')).toBe(-1)
    expect(statusIndex('awaiting_confirmation')).toBe(-1)
    expect(statusIndex('requires_manual_attention')).toBe(-1)
    expect(statusIndex('cancelled')).toBe(-1)
  })

  it('devuelve -1 para valores vacíos', () => {
    expect(statusIndex(null)).toBe(-1)
    expect(statusIndex(undefined)).toBe(-1)
    expect(statusIndex('')).toBe(-1)
  })
})

describe('isTerminalStatus', () => {
  it('considera terminales a delivered y cancelled', () => {
    for (const s of TERMINAL_STATUSES) {
      expect(isTerminalStatus(s)).toBe(true)
    }
  })

  it('el resto no es terminal', () => {
    expect(isTerminalStatus('en_ruta')).toBe(false)
    expect(isTerminalStatus(null)).toBe(false)
    expect(isTerminalStatus(undefined)).toBe(false)
  })
})

describe('orderReachedTarget', () => {
  it('resuelve la alerta del reporte original: En ruta → Llegó', () => {
    // el admin atendió y la orden llegó a "arrived"
    expect(orderReachedTarget('arrived', 'arrived')).toBe(true)
    // o terminó el flujo completo
    expect(orderReachedTarget('delivered', 'arrived')).toBe(true)
    expect(orderReachedTarget('cancelled', 'arrived')).toBe(true)
    // pero si sigue en ruta, la alerta sigue vigente
    expect(orderReachedTarget('en_ruta', 'arrived')).toBe(false)
  })

  it('respeta el orden de la cadena', () => {
    expect(orderReachedTarget('confirmed', 'preparing')).toBe(false)
    expect(orderReachedTarget('preparing', 'confirmed')).toBe(true)
    expect(orderReachedTarget('ready', 'ready')).toBe(true)
    expect(orderReachedTarget('ready', 'en_ruta')).toBe(false)
  })

  it('la rama takeaway ready → delivered se cumple recién en delivered', () => {
    expect(orderReachedTarget('ready', 'delivered')).toBe(false)
    expect(orderReachedTarget('en_ruta', 'delivered')).toBe(false)
    expect(orderReachedTarget('delivered', 'delivered')).toBe(true)
  })

  it('un estado fuera de la cadena nunca da por cumplido el objetivo', () => {
    expect(orderReachedTarget('awaiting_confirmation', 'confirmed')).toBe(false)
    expect(orderReachedTarget('requires_manual_attention', 'ready')).toBe(false)
  })

  it('cancelled cierra cualquier alerta', () => {
    expect(orderReachedTarget('cancelled', 'confirmed')).toBe(true)
    expect(orderReachedTarget('cancelled', 'delivered')).toBe(true)
  })

  it('sin estado no se puede dar nada por cumplido', () => {
    expect(orderReachedTarget(null, 'confirmed')).toBe(false)
    expect(orderReachedTarget(undefined, 'confirmed')).toBe(false)
    expect(orderReachedTarget('', 'confirmed')).toBe(false)
  })

  it('un toStatus desconocido (config corrupta) no se resuelve solo', () => {
    expect(orderReachedTarget('arrived', 'wat')).toBe(false)
  })
})

describe('isAlertStale', () => {
  it('resuelve cuando la orden ya no existe (purga)', () => {
    expect(isAlertStale(null, 'arrived')).toBe(true)
    expect(isAlertStale(undefined, 'arrived')).toBe(true)
    expect(isAlertStale('', 'arrived')).toBe(true)
  })

  it('deja la alerta abierta si la orden sigue antes del objetivo', () => {
    expect(isAlertStale('en_ruta', 'arrived')).toBe(false)
    expect(isAlertStale('preparing', 'ready')).toBe(false)
  })

  it('la resuelve cuando la orden avanzó hasta el objetivo o más allá', () => {
    expect(isAlertStale('arrived', 'arrived')).toBe(true)
    expect(isAlertStale('delivered', 'arrived')).toBe(true)
  })
})

describe('findStaleAlerts', () => {
  const alert = (id: string, orderId: string, toStatus: string) => ({
    _id: id,
    orderId,
    toStatus,
  })

  it('se queda sólo con las alertas cuyo objetivo ya se cumplió', () => {
    const alerts = [
      alert('a1', 'o1', 'arrived'), // o1 está en arrived → resolver
      alert('a2', 'o2', 'arrived'), // o2 sigue en en_ruta → mantener
      alert('a3', 'o3', 'delivered'), // o3 llegó a delivered → resolver
    ]
    const statusById = new Map([
      ['o1', 'arrived'],
      ['o2', 'en_ruta'],
      ['o3', 'delivered'],
    ])

    const stale = findStaleAlerts(alerts, statusById)
    expect(stale.map((a) => a._id)).toEqual(['a1', 'a3'])
  })

  it('resuelve las alertas de órdenes que ya no están', () => {
    const alerts = [alert('a1', 'borrada', 'ready')]
    const stale = findStaleAlerts(alerts, new Map())
    expect(stale).toHaveLength(1)
  })

  it('no marca nada cuando todas las órdenes siguen trabadas', () => {
    const alerts = [alert('a1', 'o1', 'preparing'), alert('a2', 'o2', 'delivered')]
    const statusById = new Map([
      ['o1', 'confirmed'],
      ['o2', 'preparing'],
    ])
    expect(findStaleAlerts(alerts, statusById)).toHaveLength(0)
  })

  it('con la lista vacía no devuelve nada', () => {
    expect(findStaleAlerts([], new Map())).toHaveLength(0)
  })

  it('maneja orders cancelados (flujo cerrado)', () => {
    const alerts = [alert('a1', 'o1', 'confirmed')]
    expect(findStaleAlerts(alerts, new Map([['o1', 'cancelled']]))).toHaveLength(1)
  })
})
