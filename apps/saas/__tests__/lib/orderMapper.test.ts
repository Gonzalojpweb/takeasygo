import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import {
  toSaasOrder,
  toSaasOrderItem,
  toPosOrder,
  type PosOrderInput,
} from '@/lib/pos-online/orderMapper'
import { PosError, isPosError } from '@/lib/pos-online/errors'

const CTX = {
  tenantId: '64b000000000000000000001',
  locationId: '64b000000000000000000002',
  tenantSlug: 'demo',
}

const OBJECT_ID_ITEM = '64b0000000000000000000aa'

function validOrder(overrides: Partial<PosOrderInput> = {}): PosOrderInput {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    items: [
      {
        productId: OBJECT_ID_ITEM,
        name: 'Hamburguesa',
        quantity: 2,
        unitPrice: 1500,
        total: 3000,
      },
    ],
    ...overrides,
  }
}

describe('toSaasOrderItem', () => {
  it('recalcula basePrice/extraPrice/price/subtotal en centavos', () => {
    const item = toSaasOrderItem({
      productId: OBJECT_ID_ITEM,
      name: 'Pizza',
      quantity: 3,
      unitPrice: 8000,
      total: 30000, // (8000 + 2000) * 3
      modifiers: [{ name: 'Extra queso', price: 2000 }],
    })

    expect(item.basePrice).toBe(8000)
    expect(item.extraPrice).toBe(2000)
    expect(item.price).toBe(10000)
    expect(item.quantity).toBe(3)
    expect(item.subtotal).toBe(30000)
  })

  it('volca los modifiers planos del POS a un grupo de customizations', () => {
    const item = toSaasOrderItem({
      productId: OBJECT_ID_ITEM,
      name: 'Pizza',
      quantity: 1,
      unitPrice: 8000,
      total: 11000,
      modifiers: [
        { name: 'Extra queso', price: 2000 },
        { name: 'Sin cebolla', price: 1000 },
      ],
    })

    expect(item.customizations).toHaveLength(1)
    expect(item.customizations[0].groupName).toBe('Modificadores')
    expect(item.customizations[0].selectedOptions).toEqual([
      { name: 'Extra queso', extraPrice: 2000 },
      { name: 'Sin cebolla', extraPrice: 1000 },
    ])
  })

  it('RECHAZA un total del cliente que no cierra (no lo arregla en silencio)', () => {
    let caught: unknown
    try {
      toSaasOrderItem({
        productId: OBJECT_ID_ITEM,
        name: 'Hamburguesa',
        quantity: 2,
        unitPrice: 1500,
        total: 1, // trucha: debería ser 3000
      })
    } catch (e) {
      caught = e
    }

    expect(isPosError(caught)).toBe(true)
    expect((caught as PosError).code).toBe('validation')
    expect((caught as PosError).status).toBe(400)
  })

  it('rechaza quantity < 1', () => {
    expect(() =>
      toSaasOrderItem({
        productId: OBJECT_ID_ITEM,
        name: 'X',
        quantity: 0,
        unitPrice: 100,
        total: 0,
      })
    ).toThrow(PosError)
  })

  it('rechaza precios negativos', () => {
    expect(() =>
      toSaasOrderItem({
        productId: OBJECT_ID_ITEM,
        name: 'X',
        quantity: 1,
        unitPrice: -100,
        total: -100,
      })
    ).toThrow(PosError)
  })

  it('itemId no-ObjectId queda en null (no revienta el cast de Mongoose)', () => {
    const item = toSaasOrderItem({
      productId: 'no-es-un-objectid',
      name: 'X',
      quantity: 1,
      unitPrice: 100,
      total: 100,
    })
    expect(item.menuItemId).toBeNull()
  })

  it('itemId ObjectId válido se conserva', () => {
    const item = toSaasOrderItem({
      productId: OBJECT_ID_ITEM,
      name: 'X',
      quantity: 1,
      unitPrice: 100,
      total: 100,
    })
    expect(item.menuItemId).toBeInstanceOf(mongoose.Types.ObjectId)
    expect(item.menuItemId?.toString()).toBe(OBJECT_ID_ITEM)
  })
})

describe('toSaasOrder', () => {
  it('arma el draft con los required del schema', () => {
    const draft = toSaasOrder(validOrder(), CTX)

    expect(draft.posId).toBe('11111111-2222-4333-8444-555555555555')
    expect(draft.tenantId.toString()).toBe(CTX.tenantId)
    expect(draft.locationId.toString()).toBe(CTX.locationId)
    expect(draft.source).toBe('pos')
    expect(draft.status).toBe('pending')
    expect(draft.orderNumber).toMatch(/^DEM-\d{6}-\d{4}$/)
    expect(draft.customer.name.length).toBeGreaterThan(0) // required no vacío
    // Efectivo se cobra contra entrega → nace aprobado
    expect(draft.payment.method).toBe('cash')
    expect(draft.payment.status).toBe('approved')
  })

  it('método de pago no-efectivo nace pendiente', () => {
    const draft = toSaasOrder(validOrder({ paymentMethod: 'transfer' }), CTX)
    expect(draft.payment.method).toBe('transfer')
    expect(draft.payment.status).toBe('pending')
  })

  it('el total es SIEMPRE el recalculado por el server, nunca el del cliente', () => {
    const draft = toSaasOrder(validOrder(), CTX)
    expect(draft.total).toBe(3000)
    expect(draft.subtotal).toBe(3000)
    expect(draft.discountAmount).toBe(0)
    expect(draft.payment.baseTotal).toBe(3000)
  })

  it('con tableId → dine-in; sin tableId → takeaway', () => {
    expect(toSaasOrder(validOrder({ tableId: 'mesa-uuid' }), CTX).orderMode).toBe('dine-in')
    expect(toSaasOrder(validOrder(), CTX).orderMode).toBe('takeaway')
  })

  it('sin id (posId) se rechaza: es la Idempotency-Key', () => {
    expect(() => toSaasOrder({ id: '', items: validOrder().items }, CTX)).toThrow(PosError)
    expect(() => toSaasOrder({ ...validOrder(), id: undefined as unknown as string }, CTX)).toThrow(
      PosError
    )
  })

  it('sin items se rechaza', () => {
    expect(() => toSaasOrder(validOrder({ items: [] }), CTX)).toThrow(PosError)
  })

  it('con un item malo NO se guarda nada (falla antes de tocar la DB)', () => {
    const input = validOrder({
      items: [
        { productId: OBJECT_ID_ITEM, name: 'Ok', quantity: 1, unitPrice: 100, total: 100 },
        { productId: OBJECT_ID_ITEM, name: 'Mala', quantity: 1, unitPrice: 100, total: 999 },
      ],
    })
    expect(() => toSaasOrder(input, CTX)).toThrow(PosError)
  })

  it('propaga el status que manda el POS', () => {
    expect(toSaasOrder(validOrder({ status: 'preparing' }), CTX).status).toBe('preparing')
  })

  it('respeta menuVersion y notes', () => {
    const draft = toSaasOrder(validOrder({ menuVersion: 7, notes: 'para llevar' }), CTX)
    expect(draft.menuVersion).toBe(7)
    expect(draft.notes).toBe('para llevar')
  })
})

describe('toPosOrder — round trip', () => {
  it('devuelve id = posId y los mismos importes en centavos', () => {
    const draft = toSaasOrder(validOrder({ tableId: 'mesa-uuid' }), CTX)
    const now = new Date()

    const pos = toPosOrder({ ...draft, createdAt: now, updatedAt: now })

    expect(pos.id).toBe(draft.posId)
    expect(pos.tenantId).toBe(CTX.tenantId)
    expect(pos.source).toBe('pos')
    expect(pos.status).toBe('pending')
    expect(pos.tableId).toBe('mesa-uuid')
    expect(pos.total).toBe(3000)
    expect(pos.menuVersion).toBe(1)
    expect(pos.createdAt).toBe(now)
  })

  it('reconstruye los items tal como los mandó el POS', () => {
    const input = validOrder({
      items: [
        {
          productId: OBJECT_ID_ITEM,
          name: 'Pizza',
          quantity: 3,
          unitPrice: 8000,
          total: 30000,
          modifiers: [{ name: 'Extra queso', price: 2000 }],
          notes: 'bien cocida',
        },
      ],
    })
    const draft = toSaasOrder(input, CTX)
    const now = new Date()
    const pos = toPosOrder({ ...draft, createdAt: now, updatedAt: now })

    expect(pos.items).toHaveLength(1)
    expect(pos.items[0]).toEqual({
      productId: OBJECT_ID_ITEM,
      name: 'Pizza',
      quantity: 3,
      unitPrice: 8000,
      total: 30000,
      modifiers: [{ name: 'Extra queso', price: 2000 }],
      notes: 'bien cocida',
    })
  })

  it('tableId ausente queda undefined, no null (tipo del POS)', () => {
    const draft = toSaasOrder(validOrder(), CTX)
    const now = new Date()
    const pos = toPosOrder({ ...draft, createdAt: now, updatedAt: now })
    expect(pos.tableId).toBeUndefined()
    expect('tableId' in pos && pos.tableId).toBeFalsy()
  })

  it('rechaza un documento sin posId (no exponer _id de Mongo como id)', () => {
    const draft = toSaasOrder(validOrder(), CTX)
    const now = new Date()
    expect(() =>
      toPosOrder({ ...draft, posId: null, createdAt: now, updatedAt: now })
    ).toThrow(PosError)
  })
})
