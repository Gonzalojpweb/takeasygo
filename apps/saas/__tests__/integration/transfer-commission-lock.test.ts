// ============================================================================
// transfer-commission-lock.test.ts — deuda de comisiones > $5.000 apaga la
// transferencia; pagar (MP) o el cobro del superadmin la vuelve a habilitar
// ============================================================================
// Protege, operación por operación:
//   · el tope: hasta $5.000 se puede; más de $5.000 se apaga
//   · cuenta toda la deuda impaga (vencida + pendiente + semana en curso)
//   · el catálogo del checkout (delivery Y take away) deja solo MercadoPago
//   · la creación del pedido rechaza una transferencia armada a mano
//   · se habilita sola al acreditarse el pago por MP (webhook)
//   · se habilita al marcar el superadmin «todo cobrado»
//   · el aviso del panel lo explica
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Order from '@/models/Order'
import CommissionPaymentIntent from '@/models/CommissionPaymentIntent'
import { auth } from '@/lib/auth'
import { TRANSFER_LOCK_THRESHOLD_CENTS, isTransferLocked, loadCommissionWeeks, loadTransferLock, summarizeAlerts } from '@/lib/commission-weeks'
import { buildPaymentMethodCatalog, isPaymentMethodAvailable, loadPaymentMethodContext } from '@/lib/payment-methods'
import { settleCommissionIntent } from '@/lib/commission-payments'
import { alertCopy } from '@/lib/commissions-ui'
import { POST as superadminSettle } from '@/app/api/superadmin/commissions/route'
import { GET as locksGet } from '@/app/api/superadmin/commissions/transfer-locks/route'
import { POST as createOrder } from '@/app/api/[tenant]/orders/route'

const SLUG = 'lock-tr'
let tenant: { _id: mongoose.Types.ObjectId }

async function order(createdAt: Date, fee: number) {
  return Order.create({
    tenantId: tenant._id,
    locationId: new mongoose.Types.ObjectId(),
    orderNumber: `L-${Math.random().toString(36).slice(2, 9)}`,
    status: 'delivered',
    orderMode: 'delivery',
    items: [{ name: 'Pizza', quantity: 1, basePrice: 1_000_000, extraPrice: 0, price: 1_000_000, subtotal: 1_000_000 }],
    subtotal: 1_000_000,
    total: 1_000_000 + fee,
    customer: { name: 'Cliente', phone: '+5491100000000' },
    payment: { method: 'transfer', status: 'approved', baseTotal: 1_000_000, surchargeAmount: fee, platformFeeAmount: fee, platformFeeCustomerAmount: fee, merchantSurchargeAmount: 0 },
    createdAt,
  })
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000)

async function transferEnabled(mode: 'delivery' | 'takeaway') {
  const ctx = await loadPaymentMethodContext(SLUG)
  return isPaymentMethodAvailable(buildPaymentMethodCatalog(ctx, mode), 'transfer')
}

async function asSuperadmin() {
  const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role: 'superadmin', tenantId: null })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(sa._id), role: 'superadmin', tenantId: null, assignedLocations: [] }, expires: '' } as never)
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({
    slug: SLUG,
    name: 'Pizzería',
    isActive: true,
    status: 'active',
    plan: 'full',
    transfer: { enabled: true, alias: 'pizzeria.alias', cbu: '0000000000000000000000' },
  })
})

describe('tope de deuda', () => {
  it('hasta $5.000 se puede; más de $5.000 se apaga', () => {
    expect(TRANSFER_LOCK_THRESHOLD_CENTS).toBe(500_000)
    expect(isTransferLocked(0)).toBe(false)
    expect(isTransferLocked(500_000)).toBe(false)
    expect(isTransferLocked(500_001)).toBe(true)
  })

  it('cuenta toda la deuda impaga: vencida + pendiente + semana en curso', async () => {
    await order(daysAgo(20), 200_000)
    await order(daysAgo(9), 200_000)
    await order(daysAgo(0), 100_001)
    const alerts = summarizeAlerts(await loadCommissionWeeks(tenant._id))
    expect(alerts.transferLock).toEqual({ locked: true, owedCents: 500_001, thresholdCents: 500_000 })
  })
})

describe('checkout y creación del pedido', () => {
  it('con deuda > $5.000 la transferencia desaparece en delivery y en take away', async () => {
    await order(daysAgo(0), 300_000)
    expect(await transferEnabled('delivery')).toBe(true)
    expect(await transferEnabled('takeaway')).toBe(true)

    await order(daysAgo(0), 300_000)
    expect(await transferEnabled('delivery')).toBe(false)
    expect(await transferEnabled('takeaway')).toBe(false)
    const ctx = await loadPaymentMethodContext(SLUG)
    const catalog = buildPaymentMethodCatalog(ctx, 'delivery')
    expect(catalog.transfer).toBeNull() // ni el alias se muestra
  })

  it('un pedido por transferencia armado a mano se rechaza (409) antes de cualquier efecto', async () => {
    await order(daysAgo(0), 600_000)
    const before = await Order.countDocuments({ tenantId: tenant._id })
    const res = await createOrder(
      new NextRequest(`http://localhost/api/${SLUG}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          locationId: String(new mongoose.Types.ObjectId()),
          mode: 'takeaway',
          paymentMethod: 'transfer',
          items: [{ menuItemId: String(new mongoose.Types.ObjectId()), quantity: 1 }],
          customer: { name: 'Juan', phone: '+5491122223333' },
        }),
      }),
      { params: Promise.resolve({ tenant: SLUG }) },
    )
    if (res.status === 400) {
      // El esquema del pedido cambió: el test tiene que armar un pedido válido.
      throw new Error(`pedido de prueba inválido: ${JSON.stringify(await res.json())}`)
    }
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'TRANSFER_UNAVAILABLE' })
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(before)
  })
})

describe('se vuelve a habilitar', () => {
  it('sola, cuando se acredita el pago por MercadoPago', async () => {
    const a = await order(daysAgo(9), 400_000)
    const b = await order(daysAgo(0), 200_000)
    expect((await loadTransferLock(tenant._id)).locked).toBe(true)

    const intent = await CommissionPaymentIntent.create({ tenantId: tenant._id, orderIds: [String(a._id), String(b._id)], weekStarts: [], amount: 600_000 })
    expect(await settleCommissionIntent(String(intent._id), { id: 'mp-lock-1', amountPesos: 6_000 })).toMatchObject({ status: 'settled' })
    expect((await loadTransferLock(tenant._id)).locked).toBe(false)
    expect(await transferEnabled('takeaway')).toBe(true)
  })

  it('cuando el superadmin marca todo como cobrado (pago fuera de la plataforma)', async () => {
    await order(daysAgo(20), 300_000)
    await order(daysAgo(0), 300_000) // semana en curso: también entra
    await asSuperadmin()

    const list = await (await locksGet()).json()
    expect(list.tenants.find((t: { slug: string }) => t.slug === SLUG)).toMatchObject({ locked: true, owedCents: 600_000 })

    const res = await superadminSettle(new NextRequest('http://localhost/api/superadmin/commissions', {
      method: 'POST',
      body: JSON.stringify({ tenantId: String(tenant._id), all: true }),
    }))
    expect(res.status).toBe(200)
    expect((await loadTransferLock(tenant._id)).owedCents).toBe(0)
    expect(await transferEnabled('delivery')).toBe(true)
  })

  it('pagar solo una parte que deja la deuda en $5.000 o menos también habilita', async () => {
    const a = await order(daysAgo(9), 200_000)
    await order(daysAgo(0), 400_000)
    expect((await loadTransferLock(tenant._id)).locked).toBe(true)
    const intent = await CommissionPaymentIntent.create({ tenantId: tenant._id, orderIds: [String(a._id)], weekStarts: [], amount: 200_000 })
    await settleCommissionIntent(String(intent._id), { id: 'mp-lock-2', amountPesos: 2_000 })
    expect(await loadTransferLock(tenant._id)).toMatchObject({ locked: false, owedCents: 400_000 })
  })
})

describe('aviso del panel', () => {
  it('explica que las transferencias están apagadas y cómo se habilitan', () => {
    const copy = alertCopy({
      level: 'acumulada',
      overdue: { cents: 0, weeks: 0 },
      pending: { cents: 0, weeks: 0, nextDueAt: null },
      accrued: { cents: 600_000 },
      transferLock: { locked: true, owedCents: 600_000, thresholdCents: 500_000 },
    })
    expect(copy?.title).toContain('Transferencias desactivadas')
    expect(copy?.title).toContain('$6.000,00')
    expect(copy?.body).toContain('MercadoPago')
    expect(copy?.body).toContain('se vuelven a habilitar solas')
  })
})
