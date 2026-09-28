import { describe, it, expect } from 'vitest'
import type { CashRegister, PaymentMethod } from '@takeasygo/types'
import {
  TABLE_TRANSITIONS,
  ORDER_TRANSITIONS,
  ORDER_ITEM_EDITABLE_STATUSES,
  isValidTableTransition,
  isValidOrderTransition,
  canEditOrderItems,
  assertTableTransition,
  assertOrderTransition,
  cashExpectedDelta,
  affectsCashExpected,
  isPositiveCashType,
  findMovementForOrder,
  hasMovementForOrder,
  findRegisterForChannel,
  openRegistersOf,
} from '@takeasygo/business'
import { PosError, isPosError, toPosErrorResponse } from '@/lib/pos-online/errors'

// ============================================================================
// Transiciones — única fuente de verdad POS ⇄ SaaS
// ============================================================================

describe('transiciones de mesa', () => {
  it('permite free → occupied', () => {
    expect(isValidTableTransition('free', 'occupied')).toBe(true)
    expect(() => assertTableTransition('free', 'occupied')).not.toThrow()
  })

  it('rechaza free → closed (mesa libre no se "cierra")', () => {
    expect(isValidTableTransition('free', 'closed')).toBe(false)
    expect(() => assertTableTransition('free', 'closed')).toThrow('[table] Invalid transition')
  })

  it('closed es terminal', () => {
    expect(TABLE_TRANSITIONS.closed).toEqual([])
    expect(isValidTableTransition('closed', 'free')).toBe(false)
  })

  it('el mensaje es exactamente el que espera el POS (flecha →)', () => {
    expect(() => assertTableTransition('free', 'closed')).toThrow(
      '[table] Invalid transition: free → closed. Allowed: [occupied, reserved]'
    )
  })
})

describe('transiciones de orden', () => {
  it('permite pending → confirmed y pending → preparing', () => {
    expect(isValidOrderTransition('pending', 'confirmed')).toBe(true)
    expect(isValidOrderTransition('pending', 'preparing')).toBe(true)
  })

  it('rechaza saltos (pending → ready, preparing → delivered)', () => {
    expect(isValidOrderTransition('pending', 'ready')).toBe(false)
    expect(isValidOrderTransition('preparing', 'delivered')).toBe(false)
    expect(() => assertOrderTransition('preparing', 'delivered')).toThrow(
      '[order] Invalid transition: preparing → delivered. Allowed: [ready, cancelled]'
    )
  })

  it('delivered y cancelled son terminales', () => {
    expect(ORDER_TRANSITIONS.delivered).toEqual([])
    expect(ORDER_TRANSITIONS.cancelled).toEqual([])
  })

  it('requires_manual_attention puede recuperarse hacia cualquier estado', () => {
    expect(isValidOrderTransition('requires_manual_attention', 'confirmed')).toBe(true)
    expect(isValidOrderTransition('requires_manual_attention', 'cancelled')).toBe(true)
  })
})

describe('edición de items', () => {
  it('solo pending y confirmed permiten agregar/quitar items', () => {
    expect(ORDER_ITEM_EDITABLE_STATUSES).toEqual(['pending', 'confirmed'])
    expect(canEditOrderItems('pending')).toBe(true)
    expect(canEditOrderItems('confirmed')).toBe(true)
    expect(canEditOrderItems('preparing')).toBe(false)
    expect(canEditOrderItems('delivered')).toBe(false)
  })
})

// ============================================================================
// Reglas de caja — arqueo, idempotencia, routing
// ============================================================================

describe('cashExpectedDelta — arqueo de efectivo (Consenso §1)', () => {
  const cash = 'cash' as PaymentMethod
  const mp = 'mercadopago' as PaymentMethod

  it('efectivo suma: income, deposit, sale', () => {
    expect(cashExpectedDelta('income', cash, 1000)).toBe(1000)
    expect(cashExpectedDelta('deposit', cash, 500)).toBe(500)
    expect(cashExpectedDelta('sale', cash, 2500)).toBe(2500)
  })

  it('efectivo resta: expense, withdrawal, refund, cash_order_not_collected', () => {
    expect(cashExpectedDelta('expense', cash, 1000)).toBe(-1000)
    expect(cashExpectedDelta('withdrawal', cash, 700)).toBe(-700)
    expect(cashExpectedDelta('refund', cash, 300)).toBe(-300)
    expect(cashExpectedDelta('cash_order_not_collected', cash, 900)).toBe(-900)
  })

  it('NO efectivo no mueve el arqueo, aunque sea una venta', () => {
    expect(cashExpectedDelta('sale', mp, 2500)).toBe(0)
    expect(cashExpectedDelta('income', mp, 2500)).toBe(0)
    expect(affectsCashExpected(mp)).toBe(false)
    expect(affectsCashExpected(cash)).toBe(true)
  })

  it('clasifica positivos/negativos', () => {
    expect(isPositiveCashType('sale')).toBe(true)
    expect(isPositiveCashType('refund')).toBe(false)
  })
})

describe('idempotencia de movimientos (Consenso §2.1)', () => {
  const movement = {
    id: 'm1',
    type: 'sale' as const,
    amount: 1000,
    reason: '',
    userId: 'u1',
    timestamp: new Date(),
    relatedOrderId: 'order-1',
    channel: 'counter' as const,
    paymentMethod: 'cash' as PaymentMethod,
  }

  it('mismo relatedOrderId + tipo ⇒ movimiento existente', () => {
    expect(hasMovementForOrder([movement], 'sale', 'order-1')).toBe(true)
    expect(findMovementForOrder([movement], 'sale', 'order-1')?.id).toBe('m1')
  })

  it('distinto tipo NO matchea (una orden puede tener sale y refund)', () => {
    expect(hasMovementForOrder([movement], 'refund', 'order-1')).toBe(false)
  })

  it('sin relatedOrderId ⇒ nunca matchea (movimientos manuales)', () => {
    expect(findMovementForOrder([movement], 'sale', undefined)).toBeUndefined()
  })
})

describe('routing multi-caja (Consenso §2.3)', () => {
  const reg = (id: string, def: CashRegister['defaultForChannel']): CashRegister => ({
    id,
    tenantId: 't1',
    openedBy: 'u',
    openedAt: new Date(),
    initialAmount: 0,
    movements: [],
    status: 'open',
    defaultForChannel: def,
  })

  const counter = reg('c-counter', 'counter')
  const takeasygo = reg('c-takeasygo', 'takeasygo')
  const general = reg('c-general', null)

  it('prioriza el match exacto de canal', () => {
    expect(findRegisterForChannel([counter, takeasygo], 'takeasygo')?.id).toBe('c-takeasygo')
    expect(findRegisterForChannel([counter, takeasygo], 'counter')?.id).toBe('c-counter')
  })

  it('si no hay match exacto, usa cualquier caja con canal definido', () => {
    expect(findRegisterForChannel([general, counter], 'takeasygo')?.id).toBe('c-counter')
  })

  it('último fallback: primera caja abierta', () => {
    expect(findRegisterForChannel([general], 'counter')?.id).toBe('c-general')
  })

  it('sin cajas abiertas devuelve undefined', () => {
    expect(findRegisterForChannel([], 'counter')).toBeUndefined()
  })

  it('openRegistersOf filtra por tenant y status', () => {
    const open = { ...reg('r1', null), status: 'open' as const }
    const closed = { ...reg('r2', null), status: 'closed' as const }
    expect(openRegistersOf([open, closed], 't1').map((r) => r.id)).toEqual(['r1'])
    expect(openRegistersOf([open], 'otro-tenant')).toEqual([])
  })
})

// ============================================================================
// PosError — contrato de errores
// ============================================================================

describe('PosError', () => {
  it('mapea cada code a su status HTTP', () => {
    expect(PosError.validation('x').status).toBe(400)
    expect(PosError.unauthorized().status).toBe(401)
    expect(PosError.forbidden().status).toBe(403)
    expect(PosError.notFound().status).toBe(404)
    expect(PosError.conflict('x').status).toBe(409)
    expect(PosError.idempotencyMismatch('x').status).toBe(409)
    expect(PosError.internal().status).toBe(500)
  })

  it('transition() expone los destinos legales para que el POS no reimplemente el grafo', () => {
    const e = PosError.transition('free', 'closed', ['occupied', 'reserved'])
    expect(e.code).toBe('transition_invalid')
    expect(e.status).toBe(409)
    expect(e.message).toContain('free → closed')
    expect(e.detail).toContain('occupied')
  })

  it('isPosError distingue los nuestros del resto', () => {
    expect(isPosError(PosError.notFound())).toBe(true)
    expect(isPosError(new Error('común'))).toBe(false)
    expect(isPosError(null)).toBe(false)
  })
})

describe('toPosErrorResponse', () => {
  it('respuesta tipada para PosError', async () => {
    const res = toPosErrorResponse(PosError.notFound('Mesa no encontrada'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
    expect(body.error.message).toBe('Mesa no encontrada')
  })

  it('un error genérico NO filtra su mensaje (500 opaco)', async () => {
    const res = toPosErrorResponse(new Error('MongoServerError: dup key { passwordHash }'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('dup key')
    expect(JSON.stringify(body)).not.toContain('MongoServerError')
  })
})
