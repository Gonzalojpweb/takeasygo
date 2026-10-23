// ============================================================================
// transfer-commission-lock.test.ts — más de $5.000 VENCIDOS apaga la
// transferencia; pagar (MP) o el cobro del superadmin la vuelve a habilitar
// ============================================================================
// Protege, operación por operación:
//   · el tope: hasta $5.000 vencidos se puede; más de $5.000 se apaga
//   · solo cuenta lo VENCIDO: lo pendiente (en plazo) y la semana en curso
//     no bloquean aunque la suma pase el tope
//   · el catálogo del checkout (delivery Y take away) deja solo MercadoPago
//   · la creación del pedido rechaza una transferencia armada a mano
//   · se habilita sola al acreditarse el pago por MP (webhook)
//   · se habilita al marcar el superadmin «todo cobrado»
//   · el aviso del panel lo explica
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
// Martes 20/10/2026 12:00 ART (día de pago). Semanas:
//   05/10 → vencida · 12/10 → pendiente (se paga hoy) · 19/10 → en curso
const NOW = new Date('2026-10-20T15:00:00Z')
const VENCIDA = new Date('2026-10-07T15:00:00Z')
const PENDIENTE = new Date('2026-10-14T15:00:00Z')
const EN_CURSO = new Date('2026-10-20T12:00:00Z')
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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  tenant = await Tenant.create({
    slug: SLUG,
    name: 'Pizzería',
    isActive: true,
    status: 'active',
    plan: 'full',
    transfer: { enabled: true, alias: 'pizzeria.alias', cbu: '0000000000000000000000' },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tope de deuda vencida', () => {
  it('hasta $5.000 vencidos se puede; más de $5.000 se apaga', () => {
    expect(TRANSFER_LOCK_THRESHOLD_CENTS).toBe(500_000)
    expect(isTransferLocked(0)).toBe(false)
    expect(isTransferLocked(500_000)).toBe(false)
    expect(isTransferLocked(500_001)).toBe(true)
  })

  it('lo pendiente y la semana en curso NO bloquean, aunque la suma pase el tope', async () => {
    await order(VENCIDA, 490_000) // $4.900 vencidos
    await order(PENDIENTE, 300_000)
    await order(EN_CURSO, 300_000)
    const alerts = summarizeAlerts(await loadCommissionWeeks(tenant._id))
    expect(alerts.overdue.cents).toBe(490_000)
    expect(alerts.transferLock).toEqual({ locked: false, overdueCents: 490_000, thresholdCents: 500_000 })
    expect(await transferEnabled('delivery')).toBe(true)
  })

  it('más de $5.000 vencidos bloquea', async () => {
    await order(VENCIDA, 500_001)
    expect(summarizeAlerts(await loadCommissionWeeks(tenant._id)).transferLock).toEqual({ locked: true, overdueCents: 500_001, thresholdCents: 500_000 })
  })

  it('una semana pendiente que no se paga el martes pasa a vencida y ahí bloquea', async () => {
    await order(PENDIENTE, 600_000)
    expect((await loadTransferLock(tenant._id)).locked).toBe(false) // martes: todavía en plazo
    vi.setSystemTime(new Date('2026-10-21T03:00:00Z')) // miércoles 00:00 ART
    expect((await loadTransferLock(tenant._id)).locked).toBe(true)
  })
})

describe('checkout y creación del pedido', () => {
  it('con más de $5.000 vencidos la transferencia desaparece en delivery y en take away', async () => {
    await order(VENCIDA, 600_000)
    expect(await transferEnabled('delivery')).toBe(false)
    expect(await transferEnabled('takeaway')).toBe(false)
    const ctx = await loadPaymentMethodContext(SLUG)
    expect(buildPaymentMethodCatalog(ctx, 'delivery').transfer).toBeNull() // ni el alias se muestra
  })

  it('un pedido por transferencia armado a mano se rechaza (409) antes de cualquier efecto', async () => {
    await order(VENCIDA, 600_000)
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
  it('sola, cuando se acredita el pago por MercadoPago de lo vencido', async () => {
    const a = await order(VENCIDA, 600_000)
    await order(EN_CURSO, 900_000) // la semana en curso no importa
    expect((await loadTransferLock(tenant._id)).locked).toBe(true)

    const intent = await CommissionPaymentIntent.create({ tenantId: tenant._id, orderIds: [String(a._id)], weekStarts: [], amount: 600_000 })
    expect(await settleCommissionIntent(String(intent._id), { id: 'mp-lock-1', amountPesos: 6_000 })).toMatchObject({ status: 'settled' })
    expect(await loadTransferLock(tenant._id)).toMatchObject({ locked: false, overdueCents: 0 })
    expect(await transferEnabled('takeaway')).toBe(true)
  })

  it('cuando el superadmin marca todo como cobrado (pago fuera de la plataforma)', async () => {
    await order(VENCIDA, 600_000)
    await order(EN_CURSO, 100_000)
    await asSuperadmin()

    const list = await (await locksGet()).json()
    expect(list.tenants.find((t: { slug: string }) => t.slug === SLUG)).toMatchObject({ locked: true, overdueCents: 600_000, owedCents: 700_000 })

    const res = await superadminSettle(new NextRequest('http://localhost/api/superadmin/commissions', {
      method: 'POST',
      body: JSON.stringify({ tenantId: String(tenant._id), all: true }),
    }))
    expect(res.status).toBe(200)
    expect(await loadTransferLock(tenant._id)).toMatchObject({ locked: false, overdueCents: 0 })
    expect(await transferEnabled('delivery')).toBe(true)
  })

  it('pagar una parte que deja lo vencido en $5.000 o menos también habilita', async () => {
    const a = await order(VENCIDA, 200_000)
    await order(VENCIDA, 400_000)
    expect((await loadTransferLock(tenant._id)).locked).toBe(true)
    const intent = await CommissionPaymentIntent.create({ tenantId: tenant._id, orderIds: [String(a._id)], weekStarts: [], amount: 200_000 })
    await settleCommissionIntent(String(intent._id), { id: 'mp-lock-2', amountPesos: 2_000 })
    expect(await loadTransferLock(tenant._id)).toMatchObject({ locked: false, overdueCents: 400_000 })
  })
})

describe('aviso del panel', () => {
  it('explica que las transferencias están apagadas por lo vencido y cómo se habilitan', () => {
    const copy = alertCopy({
      level: 'vencida',
      overdue: { cents: 600_000, weeks: 1 },
      pending: { cents: 0, weeks: 0, nextDueAt: null },
      accrued: { cents: 0 },
      transferLock: { locked: true, overdueCents: 600_000, thresholdCents: 500_000 },
    })
    expect(copy?.title).toContain('Transferencias desactivadas')
    expect(copy?.title).toContain('$6.000,00')
    expect(copy?.title).toContain('vencidas')
    expect(copy?.body).toContain('MercadoPago')
    expect(copy?.body).toContain('se vuelven a habilitar solas')
  })
})
