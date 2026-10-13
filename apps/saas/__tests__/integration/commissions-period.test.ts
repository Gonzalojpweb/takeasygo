import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import { computePeriodCommissions, computeTransferPayable } from '@/lib/commissions'

/**
 * Fuente única de verdad de comisiones (lib/commissions.ts).
 *
 * Invariantes que este test protege:
 *  - total = settled + pending (por método y en general) — los números cierran.
 *  - transfer.pending = lo que cobra POST /commissions/pay y el banner del dashboard.
 *  - Un settlement que cubre otras órdenes NO descuenta órdenes del período
 *    (bug viejo del cálculo por solapamiento de fechas).
 *  - Settlements sin orderIds (datos viejos) se descuentan como ajuste.
 */

const TENANT_A = new mongoose.Types.ObjectId()
const TENANT_B = new mongoose.Types.ObjectId()
const LOCATION = new mongoose.Types.ObjectId()

function d(iso: string) {
  return new Date(iso)
}

async function makeOrder(opts: {
  createdAt: Date
  method: 'transfer' | 'mercadopago' | 'cash'
  fee: number
  tenantId?: mongoose.Types.ObjectId
  status?: string
  paymentStatus?: string
  orderMode?: string
}) {
  return Order.create({
    tenantId: opts.tenantId ?? TENANT_A,
    locationId: LOCATION,
    orderNumber: `CMP-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    status: opts.status ?? 'delivered',
    orderMode: opts.orderMode ?? 'delivery',
    items: [{ name: 'Plato', quantity: 1, basePrice: 5000, extraPrice: 0, price: 5000, subtotal: 5000 }],
    subtotal: 5000,
    total: 5500,
    customer: { name: 'Cliente', phone: '+5491100000000' },
    payment: {
      method: opts.method,
      status: opts.paymentStatus ?? 'approved',
      baseTotal: 5000,
      platformFeeAmount: opts.fee,
    },
    createdAt: opts.createdAt,
  })
}

async function makeSettlement(opts: {
  from: Date
  to: Date
  amountCollected: number
  orderIds?: string[]
  tenantId?: mongoose.Types.ObjectId
}) {
  return CommissionSettlement.create({
    tenantId: opts.tenantId ?? TENANT_A,
    from: opts.from,
    to: opts.to,
    amountCollected: opts.amountCollected,
    collectedAt: new Date(),
    collectedBy: 'test',
    orderIds: opts.orderIds ?? [],
    status: 'paid',
  })
}

const FROM = d('2026-10-01T00:00:00.000Z')
const TO = d('2026-10-31T23:59:59.999Z')

describe('computePeriodCommissions', () => {
  it('cierra la cuenta: total = settled + pending por método y en general', async () => {
    const o1 = await makeOrder({ createdAt: d('2026-10-05T12:00:00Z'), method: 'transfer', fee: 1000 })
    await makeOrder({ createdAt: d('2026-10-06T12:00:00Z'), method: 'transfer', fee: 2000 })
    const o3 = await makeOrder({ createdAt: d('2026-10-07T12:00:00Z'), method: 'mercadopago', fee: 500 })

    // Pago que cubre o1 y o3 (transfer + mercadopago)
    await makeSettlement({ from: FROM, to: TO, amountCollected: 1500, orderIds: [o1._id.toString(), o3._id.toString()] })

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)

    expect(period.total).toBe(3500)
    expect(period.settled).toBe(1500)
    expect(period.pending).toBe(2000)
    expect(period.total).toBe(period.settled + period.pending)

    const transfer = period.breakdown.find((r) => r.method === 'transfer')!
    expect(transfer.total).toBe(3000)
    expect(transfer.settled).toBe(1000)
    expect(transfer.pending).toBe(2000)
    expect(transfer.total).toBe(transfer.settled + transfer.pending)

    const mp = period.breakdown.find((r) => r.method === 'mercadopago')!
    expect(mp.pending).toBe(0)
  })

  it('un settlement que cubre órdenes de OTRO período no descuenta estas órdenes', async () => {
    // Orden de octubre sin pagar
    await makeOrder({ createdAt: d('2026-10-10T12:00:00Z'), method: 'transfer', fee: 3000 })
    // Settlement de un rango que solapa octubre pero cuyas órdenes son de septiembre
    await makeSettlement({
      from: d('2026-09-15T00:00:00Z'),
      to: d('2026-10-05T23:59:59Z'),
      amountCollected: 9999,
      orderIds: ['666666666666666666666666'],
    })

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)
    expect(period.total).toBe(3000)
    expect(period.settled).toBe(0)
    expect(period.pending).toBe(3000)
  })

  it('descuenta como ajuste los settlements viejos sin orderIds', async () => {
    await makeOrder({ createdAt: d('2026-10-08T12:00:00Z'), method: 'transfer', fee: 4000 })
    await makeSettlement({ from: FROM, to: TO, amountCollected: 1500, orderIds: [] })

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)
    expect(period.unattributedSettled).toBe(1500)
    expect(period.settled).toBe(1500)
    expect(period.pending).toBe(2500)
    expect(period.total).toBe(period.settled + period.pending)
  })

  it('excluye órdenes canceladas y no aprobadas, y aísla tenants', async () => {
    await makeOrder({ createdAt: d('2026-10-05T12:00:00Z'), method: 'transfer', fee: 1000, status: 'cancelled' })
    await makeOrder({ createdAt: d('2026-10-05T12:00:00Z'), method: 'transfer', fee: 1000, paymentStatus: 'pending' })
    await makeOrder({ createdAt: d('2026-10-05T12:00:00Z'), method: 'transfer', fee: 777, tenantId: TENANT_B })

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)
    expect(period.total).toBe(0)
    expect(period.orderCount).toBe(0)
  })

  it('agrupa transferencias semana a semana y las sumas cierran contra el total transfer', async () => {
    // 2026-10-05 es lunes; 2026-10-12 también
    const o1 = await makeOrder({ createdAt: d('2026-10-05T12:00:00Z'), method: 'transfer', fee: 1000 })
    await makeOrder({ createdAt: d('2026-10-08T12:00:00Z'), method: 'transfer', fee: 2000 })
    await makeOrder({ createdAt: d('2026-10-12T12:00:00Z'), method: 'transfer', fee: 500 })
    // MP no entra en el desglose semanal de transferencias
    await makeOrder({ createdAt: d('2026-10-06T12:00:00Z'), method: 'mercadopago', fee: 9999 })

    await makeSettlement({ from: FROM, to: TO, amountCollected: 1000, orderIds: [o1._id.toString()] })

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)

    expect(period.weekly).toHaveLength(2)
    const [semana1, semana2] = period.weekly

    expect(semana1.total).toBe(3000)
    expect(semana1.settled).toBe(1000)
    expect(semana1.pending).toBe(2000)
    expect(semana1.orderCount).toBe(2)
    expect(semana1.total).toBe(semana1.settled + semana1.pending)

    expect(semana2.total).toBe(500)
    expect(semana2.pending).toBe(500)
    expect(semana2.orderCount).toBe(1)

    // Las sumas semanales cierran exactamente contra la fila transfer del período
    expect(period.weekly.reduce((s, w) => s + w.total, 0)).toBe(period.transfer.total)
    expect(period.weekly.reduce((s, w) => s + w.settled, 0)).toBe(period.transfer.settled)
    expect(period.weekly.reduce((s, w) => s + w.pending, 0)).toBe(period.transfer.pending)
  })

  it('el ajuste por settlements viejos sin orderIds también descuenta de la semana', async () => {
    await makeOrder({ createdAt: d('2026-10-07T12:00:00Z'), method: 'transfer', fee: 4000 })
    await makeSettlement({ from: FROM, to: TO, amountCollected: 1500, orderIds: [] })

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)
    expect(period.weekly).toHaveLength(1)
    expect(period.weekly[0].total).toBe(4000)
    expect(period.weekly[0].settled).toBe(1500)
    expect(period.weekly[0].pending).toBe(2500)
    expect(period.weekly[0].pending).toBe(period.transfer.pending)
  })
})

describe('computeTransferPayable', () => {
  it('devuelve exactamente lo que cobra el botón Pagar', async () => {
    const o1 = await makeOrder({ createdAt: d('2026-10-03T12:00:00Z'), method: 'transfer', fee: 1200 })
    await makeOrder({ createdAt: d('2026-10-04T12:00:00Z'), method: 'transfer', fee: 800 })
    await makeOrder({ createdAt: d('2026-10-05T12:00:00Z'), method: 'mercadopago', fee: 5000 })

    await makeSettlement({ from: FROM, to: TO, amountCollected: 1200, orderIds: [o1._id.toString()] })

    const payable = await computeTransferPayable(TENANT_A, FROM, TO)
    expect(payable.pendingCents).toBe(800)
    expect(payable.orderCount).toBe(1)

    const period = await computePeriodCommissions(TENANT_A, FROM, TO)
    expect(payable.pendingCents).toBe(period.transfer.pending)
  })

  it('no puede ser negativo aunque los datos viejos lo sugieran', async () => {
    await makeSettlement({ from: FROM, to: TO, amountCollected: 5000, orderIds: [] })
    const payable = await computeTransferPayable(TENANT_A, FROM, TO)
    expect(payable.pendingCents).toBe(0)
  })
})
