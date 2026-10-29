import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'

/**
 * Informe de caja (2026-10-29):
 *  X3/X7 — conciliación cobros ↔ caja antes del cierre.
 *  X4    — link absoluto del Z (con vencimiento).
 *  Fiscal — IVA por alícuota del turno en el Z.
 */

const orderFind = vi.fn()
const fiscalFind = vi.fn()
const movementCreate = vi.fn()
const registerFindOne = vi.fn()
const registerUpdateOne = vi.fn()

function chain<T>(result: T) {
  const q = { select: () => q, limit: () => q, sort: () => q, lean: async () => result }
  return q
}

vi.mock('@/models/Order', () => ({ default: { find: (...a: unknown[]) => orderFind(...a) } }))
vi.mock('@/models/FiscalDocument', () => ({ default: { find: (...a: unknown[]) => fiscalFind(...a) } }))
vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/CashMovement', () => ({ default: { create: (...a: unknown[]) => movementCreate(...a) } }))
vi.mock('@/models/CashRegister', () => ({
  default: {
    findOne: (...a: unknown[]) => registerFindOne(...a),
    updateOne: (...a: unknown[]) => registerUpdateOne(...a),
  },
}))

const tenantId = new mongoose.Types.ObjectId().toString()
const locationId = new mongoose.Types.ObjectId().toString()
const ctx = { tenantId, locationId, user: { id: 'u1', role: 'cashier' } } as never
const openedAt = new Date('2026-10-29T12:00:00Z')

describe('reconcileShiftSales (X3/X7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // findOpenRegister: CashRegister.findOne(...).lean().exec()
    const reg = { _id: new mongoose.Types.ObjectId(), posId: 'reg-1', status: 'open' }
    registerFindOne.mockReturnValue({ lean: () => ({ exec: async () => reg }) })
    registerUpdateOne.mockResolvedValue({ matchedCount: 1 })
  })

  it('registra la venta que faltaba y no duplica las que ya estaban', async () => {
    const { reconcileShiftSales } = await import('@/lib/pos-online/cashReconcile')
    orderFind.mockReturnValue(chain([
      { _id: new mongoose.Types.ObjectId(), posId: 'o1', orderNumber: 'A-1', posPayments: [{ posId: 'p1', method: 'cash', amount: 1000, paidAt: openedAt }] },
      { _id: new mongoose.Types.ObjectId(), posId: 'o2', orderNumber: 'A-2', posPayments: [{ posId: 'p2', method: 'cash', amount: 500, paidAt: openedAt }] },
    ]))
    // o1 ya tenía su movimiento (índice único) — o2 no.
    movementCreate.mockImplementation(async (doc: { posId: string }) => {
      if (doc.posId === 'pay:p1') throw Object.assign(new Error('dup'), { code: 11000 })
      return doc
    })

    const recorded = await reconcileShiftSales(ctx, openedAt)

    expect(recorded).toBe(1)
    expect(movementCreate).toHaveBeenCalledWith(expect.objectContaining({ posId: 'pay:p2', type: 'sale', amount: 500, relatedOrderId: 'o2' }))
    // filtro por tenant y sede primero (aislamiento multi-tenant)
    const filter = orderFind.mock.calls[0][0]
    expect(String(filter.tenantId)).toBe(tenantId)
    expect(String(filter.locationId)).toBe(locationId)
  })

  it('una venta anulada en el turno también concilia su devolución', async () => {
    const { reconcileShiftSales } = await import('@/lib/pos-online/cashReconcile')
    orderFind.mockReturnValue(chain([
      {
        _id: new mongoose.Types.ObjectId(), posId: 'o3', orderNumber: 'A-3',
        posPayments: [{ posId: 'p3', method: 'cash', amount: 700, paidAt: openedAt }],
        voided: { at: new Date(openedAt.getTime() + 60_000), approvedBy: 'Encargado' },
      },
    ]))
    movementCreate.mockImplementation(async (doc: unknown) => doc)

    const recorded = await reconcileShiftSales(ctx, openedAt)

    expect(recorded).toBe(2)
    expect(movementCreate).toHaveBeenCalledWith(expect.objectContaining({ posId: 'void:p3', type: 'refund', source: 'void', approvedBy: 'Encargado' }))
  })

  it('un error en una orden no corta la conciliación de las demás', async () => {
    const { reconcileShiftSales } = await import('@/lib/pos-online/cashReconcile')
    orderFind.mockReturnValue(chain([
      { _id: new mongoose.Types.ObjectId(), posId: 'o4', posPayments: [{ posId: 'p4', method: 'cash', amount: 100 }] },
      { _id: new mongoose.Types.ObjectId(), posId: 'o5', posPayments: [{ posId: 'p5', method: 'cash', amount: 200 }] },
    ]))
    movementCreate.mockImplementation(async (doc: { posId: string }) => {
      if (doc.posId === 'pay:p4') throw new Error('db caída')
      return doc
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await reconcileShiftSales(ctx, openedAt)).toBe(1)
    spy.mockRestore()
  })
})

describe('zShareUrl (X4)', () => {
  it('arma la URL absoluta del cierre y respeta el vencimiento de 30 días', async () => {
    const { zShareUrl } = await import('@/lib/cash/z-share')
    const now = new Date('2026-10-29T12:00:00Z')
    expect(zShareUrl('https://www.takeasygo.com/', 'que-cachapa', 'tok-1', now, now)).toBe('https://www.takeasygo.com/que-cachapa/cierre/tok-1')
    expect(zShareUrl('https://www.takeasygo.com', 'que-cachapa', 'tok-1', new Date('2026-09-01T00:00:00Z'), now)).toBeNull()
  })
})

describe('fiscalSummaryForShift — IVA por alícuota', () => {
  it('facturas suman, notas de crédito restan y los pendientes no cuentan', async () => {
    const { fiscalSummaryForShift } = await import('@/lib/fiscal/shift-summary')
    fiscalFind.mockReturnValue(chain([
      { kind: 'invoice', status: 'authorized', amounts: { totalCents: 12100 }, ivaGroups: [{ ivaRate: 21, baseCents: 10000, amountCents: 2100 }] },
      { kind: 'invoice', status: 'authorized', amounts: { totalCents: 11050 }, ivaGroups: [{ ivaRate: 10.5, baseCents: 10000, amountCents: 1050 }] },
      { kind: 'credit_note', status: 'authorized', amounts: { totalCents: 1210 }, ivaGroups: [{ ivaRate: 21, baseCents: 1000, amountCents: 210 }] },
      { kind: 'invoice', status: 'pending', amounts: { totalCents: 999 }, ivaGroups: [{ ivaRate: 21, baseCents: 826, amountCents: 173 }] },
    ]))

    const s = await fiscalSummaryForShift({ tenantId, locationId, from: openedAt, to: new Date() })

    expect(s).toMatchObject({ invoices: 2, invoicedCents: 23150, creditNotes: 1, creditedCents: 1210, pending: 1 })
    expect(s?.iva).toEqual([
      { rate: 21, netCents: 9000, ivaCents: 1890 },
      { rate: 10.5, netCents: 10000, ivaCents: 1050 },
    ])
  })
})
