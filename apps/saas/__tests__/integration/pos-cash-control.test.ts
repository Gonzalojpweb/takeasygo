import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import User from '@/models/User'
import CashMovement from '@/models/CashMovement'
import CashRegister from '@/models/CashRegister'
import Printer from '@/models/Printer'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { signJwt } from '@takeasygo/business/jwt'
import { posPinLookup } from '@takeasygo/business/pos-pin'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as OPEN, GET as LIST } from '@/app/api/[tenant]/pos/cash/registers/route'
import { POST as MOVE } from '@/app/api/[tenant]/pos/cash/registers/[id]/movements/route'
import { POST as CLOSE } from '@/app/api/[tenant]/pos/cash/registers/[id]/close/route'
import { POST as CREATE } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as PAY } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { POST as VOID } from '@/app/api/[tenant]/pos/orders/[id]/void/route'
import { DELETE as REMOVE_ITEM } from '@/app/api/[tenant]/pos/orders/[id]/items/[productId]/route'
import { POST as PRINT_Z } from '@/app/api/[tenant]/pos/cash/registers/[id]/print/route'

/**
 * Fase 1 de caja (2026-10) — control profesional.
 * Documentación: ADMIN/VALIDACION_CAJA_IVA_ARCA_2026-10-23.md y
 * ADMIN/FASE1_CAJA_PROFESIONAL.md.
 *
 *  · Cierre ciego: el cajero no recibe el saldo esperado; cuenta por billete.
 *  · Egresos con categoría; retiros con PIN de encargado.
 *  · El cobro registra la venta en la caja (sin duplicar con el POS).
 *  · Anular una venta cobrada: PIN de encargado + devolución automática.
 *  · Cancelar un pedido en cocina o quitar productos comandados: encargado.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PEPPER = 'pepper-de-test-de-al-menos-16'

const SLUG = 'caja-pro'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
const CASHIER_ID = '64b0000000000000000000c1'
const PRODUCT_ID = '64b0000000000000000000aa'
const MANAGER_PIN = '482913'

let tenantId: string
let locationId: string
let managerId: string

function token(role: 'cashier' | 'manager', sub = CASHIER_ID): string {
  return signJwt({ sub, tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
}

function req(
  url: string,
  body: unknown,
  opts: { method?: string; role?: 'cashier' | 'manager'; pin?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token(opts.role ?? 'cashier')}`,
    'x-location-id': locationId,
  }
  if (opts.pin) headers['x-manager-pin'] = opts.pin
  return new Request(url, {
    method: opts.method ?? 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}

const tenantParams = () => ({ params: Promise.resolve({ tenant: SLUG }) })
const idParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

async function openRegister(role: 'cashier' | 'manager' = 'cashier') {
  const res = await OPEN(req(`${BASE}/cash/registers`, { id: crypto.randomUUID(), initialAmount: 100000 }, { role }), tenantParams())
  expect(res.status).toBe(201)
  return (await res.json()).register as { id: string; expectedAmount?: number }
}

function move(registerId: string, body: Record<string, unknown>, opts: { role?: 'cashier' | 'manager'; pin?: string } = {}) {
  return MOVE(
    req(
      `${BASE}/cash/registers/${registerId}/movements`,
      { id: crypto.randomUUID(), channel: 'counter', paymentMethod: 'cash', ...body },
      opts
    ),
    idParams(registerId)
  )
}

async function createOrder(status: 'pending' | 'confirmed' = 'pending'): Promise<string> {
  const id = crypto.randomUUID()
  const res = await CREATE(
    req(`${BASE}/orders`, {
      id,
      status,
      items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 2, unitPrice: 1500, total: 3000 }],
    }),
    tenantParams()
  )
  expect(res.status).toBe(201)
  return id
}

function pay(orderId: string, payments: { method: string; amount: number }[], reason = 'Pedido M5') {
  return PAY(
    req(`${BASE}/orders/${orderId}/payments`, {
      reason,
      payments: payments.map((p) => ({ id: crypto.randomUUID(), ...p })),
    }),
    idParams(orderId)
  )
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  process.env.POS_PIN_PEPPER = PEPPER
  __resetPosJwtKeyCacheForTests()
})
afterAll(() => {
  delete process.env.POS_PIN_PEPPER
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Caja Pro', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Local', slug: 'local', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    categories: [{ name: 'Platos', sortOrder: 0, items: [{ _id: PRODUCT_ID, name: 'Hamburguesa', price: 1500 }] }],
  })
  const manager = await User.create({
    name: 'Encargada Ana',
    email: `ana-${Math.random().toString(36).slice(2)}@test.com`,
    password: 'x-secret-123',
    phone: `+54${Math.floor(Math.random() * 1e10)}`,
    role: 'manager',
    tenantId,
    isActive: true,
    pin: await bcrypt.hash(MANAGER_PIN, 4),
    posPinLookup: posPinLookup(PEPPER, tenantId, MANAGER_PIN),
  })
  managerId = manager._id.toString()
})

describe('cierre ciego', () => {
  it('el cajero no recibe el saldo esperado de la caja abierta; el encargado sí', async () => {
    const reg = await openRegister('cashier')
    expect(reg.expectedAmount).toBeUndefined()

    const asManager = await LIST(req(`${BASE}/cash/registers?status=open`, undefined, { method: 'GET', role: 'manager' }), tenantParams())
    const [open] = (await asManager.json()).registers
    expect(open.expectedAmount).toBe(100000)
  })

  it('cierra con el conteo por billete: el total lo calcula el server y queda en el Z', async () => {
    const reg = await openRegister()
    await move(reg.id, { type: 'sale', amount: 3000, reason: 'Venta' })

    const res = await CLOSE(
      req(`${BASE}/cash/registers/${reg.id}/close`, {
        // $1.000 × 1 + $20.000 × 0 + $25 en monedas
        closingCount: { bills: [{ value: 100_000, count: 1 }, { value: 2_000_000, count: 0 }], coins: 2500 },
      }),
      idParams(reg.id)
    )
    expect(res.status).toBe(200)
    const { register } = await res.json()
    expect(register.finalAmount).toBe(102500)
    expect(register.difference).toBe(-500)
    expect(register.zReport.closingCount.total).toBe(102500)
    expect(register.zReport.closingCount.bills).toEqual([{ value: 100_000, count: 1 }])
  })

  it('conteo con un billete inexistente o un total que no coincide → 400', async () => {
    const reg = await openRegister()
    const unknown = await CLOSE(
      req(`${BASE}/cash/registers/${reg.id}/close`, { closingCount: { bills: [{ value: 123, count: 1 }] } }),
      idParams(reg.id)
    )
    expect(unknown.status).toBe(400)

    const mismatch = await CLOSE(
      req(`${BASE}/cash/registers/${reg.id}/close`, {
        finalAmount: 1,
        closingCount: { bills: [{ value: 100_000, count: 1 }] },
      }),
      idParams(reg.id)
    )
    expect(mismatch.status).toBe(400)
    expect((await CashRegister.findOne({ posId: reg.id }).lean())?.status).toBe('open')
  })
})

describe('egresos', () => {
  it('un gasto sin categoría → 400; con categoría usa su nombre como concepto', async () => {
    const reg = await openRegister()
    const noCategory = await move(reg.id, { type: 'expense', amount: 500, reason: 'Hielo' })
    expect(noCategory.status).toBe(400)

    const ok = await move(reg.id, { type: 'expense', amount: 500, category: 'suppliers' })
    expect(ok.status).toBe(201)
    const { movement } = await ok.json()
    expect(movement.category).toBe('suppliers')
    expect(movement.reason).toBe('Proveedores')
  })

  it('un retiro del cajero pide el PIN del encargado; un PIN incorrecto se rechaza', async () => {
    const reg = await openRegister()
    const body = { type: 'withdrawal', amount: 20000, category: 'owner_withdrawal' }

    const noPin = await move(reg.id, body)
    expect(noPin.status).toBe(403)
    expect((await noPin.json()).error.code).toBe('approval_required')

    const wrong = await move(reg.id, body, { pin: '111222' })
    expect(wrong.status).toBe(403)
    expect((await wrong.json()).error.code).toBe('approval_invalid')

    const ok = await move(reg.id, body, { pin: MANAGER_PIN })
    expect(ok.status).toBe(201)
    expect((await ok.json()).movement.approvedBy).toBe(managerId)
  })

  it('el encargado retira sin PIN (aprobación implícita)', async () => {
    const reg = await openRegister()
    const res = await move(reg.id, { type: 'withdrawal', amount: 20000, category: 'other' }, { role: 'manager' })
    expect(res.status).toBe(201)
  })
})

describe('cobro → caja en la misma operación', () => {
  it('el cobro registra la venta en la caja abierta; el movimiento del POS no la duplica', async () => {
    const reg = await openRegister()
    const orderId = await createOrder()

    const res = await pay(orderId, [{ method: 'cash', amount: 3000 }])
    expect(res.status).toBe(201)
    expect((await res.json()).cashRegisterId).toBe(reg.id)

    const recorded = await CashMovement.find({ relatedOrderId: orderId }).lean()
    expect(recorded).toHaveLength(1)
    expect(recorded[0].source).toBe('payment')
    expect(recorded[0].reason).toBe('Pedido M5')

    // El POS manda su propio movimiento después (otro posId, otro concepto).
    const fromPos = await move(reg.id, { type: 'sale', amount: 3000, reason: 'Pedido mostrador', relatedOrderId: orderId })
    expect(fromPos.status).toBe(200)
    expect(await CashMovement.countDocuments({ relatedOrderId: orderId })).toBe(1)
    expect((await CashRegister.findOne({ posId: reg.id }).lean())?.expectedAmount).toBe(103000)
  })

  it('cobro partido: una venta por parte con la clave `posId#i`', async () => {
    await openRegister()
    const orderId = await createOrder()
    await pay(orderId, [{ method: 'cash', amount: 1000 }, { method: 'posnet_debit', amount: 2000 }])
    const keys = (await CashMovement.find({ type: 'sale' }).lean()).map((m) => m.relatedOrderId).sort()
    expect(keys).toEqual([`${orderId}#0`, `${orderId}#1`])
  })

  it('sin caja abierta el cobro sigue (el POS lo deja en pendientes)', async () => {
    const orderId = await createOrder()
    const res = await pay(orderId, [{ method: 'cash', amount: 3000 }])
    expect(res.status).toBe(201)
    expect((await res.json()).cashRegisterId).toBeNull()
  })
})

describe('anular una venta cobrada', () => {
  it('cajero sin PIN → approval_required; con PIN: orden anulada y devolución en caja', async () => {
    const reg = await openRegister()
    const orderId = await createOrder()
    await pay(orderId, [{ method: 'cash', amount: 1000 }, { method: 'mercadopago', amount: 2000 }])

    const noPin = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'load_error' }), idParams(orderId))
    expect(noPin.status).toBe(403)
    expect((await noPin.json()).error.code).toBe('approval_required')

    const ok = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'load_error' }, { pin: MANAGER_PIN }), idParams(orderId))
    expect(ok.status).toBe(200)
    const { order } = await ok.json()
    expect(order.status).toBe('cancelled')
    expect(order.voided.reason).toBe('load_error')

    const refunds = await CashMovement.find({ type: 'refund' }).lean()
    expect(refunds.map((r) => [r.relatedOrderId, r.paymentMethod, r.amount, r.source, r.approvedBy]).sort()).toEqual([
      [`${orderId}#0`, 'cash', 1000, 'void', managerId],
      [`${orderId}#1`, 'mercadopago', 2000, 'void', managerId],
    ])
    // Solo el efectivo baja el arqueo: 100.000 + 1.000 − 1.000.
    expect((await CashRegister.findOne({ posId: reg.id }).lean())?.expectedAmount).toBe(100000)

    // Reintento: idempotente, sin devoluciones nuevas.
    const again = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'load_error' }, { pin: MANAGER_PIN }), idParams(orderId))
    expect(again.status).toBe(200)
    expect(await CashMovement.countDocuments({ type: 'refund' })).toBe(2)

    // El Z cuenta la anulación una vez.
    const closed = await CLOSE(req(`${BASE}/cash/registers/${reg.id}/close`, { finalAmount: 100000 }), idParams(reg.id))
    expect((await closed.json()).register.zReport.voidCount).toBe(1)
  })

  it('sin caja abierta, sin cobro o sin motivo → no se anula', async () => {
    const orderId = await createOrder()
    const unpaid = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'other' }, { role: 'manager' }), idParams(orderId))
    expect(unpaid.status).toBe(409)

    await pay(orderId, [{ method: 'cash', amount: 3000 }])
    const noRegister = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'other' }, { role: 'manager' }), idParams(orderId))
    expect(noRegister.status).toBe(409)

    await openRegister()
    const noReason = await VOID(req(`${BASE}/orders/${orderId}/void`, {}, { role: 'manager' }), idParams(orderId))
    expect(noReason.status).toBe(400)
    expect((await Order.findOne({ posId: orderId }).lean())?.status).not.toBe('cancelled')
  })
})

describe('cancelaciones y productos comandados', () => {
  it('una orden cobrada no se cancela por PATCH (hay que anularla)', async () => {
    const orderId = await createOrder()
    await pay(orderId, [{ method: 'cash', amount: 3000 }])
    const res = await PATCH(req(`${BASE}/orders/${orderId}`, { status: 'cancelled' }, { method: 'PATCH', role: 'manager' }), idParams(orderId))
    expect(res.status).toBe(409)
  })

  it('cancelar un pedido en cocina: cajero necesita PIN; pendiente se cancela libre', async () => {
    const inKitchen = await createOrder('confirmed')
    const noPin = await PATCH(req(`${BASE}/orders/${inKitchen}`, { status: 'cancelled' }, { method: 'PATCH' }), idParams(inKitchen))
    expect(noPin.status).toBe(403)
    const ok = await PATCH(req(`${BASE}/orders/${inKitchen}`, { status: 'cancelled' }, { method: 'PATCH', pin: MANAGER_PIN }), idParams(inKitchen))
    expect(ok.status).toBe(200)

    const pending = await createOrder('pending')
    const free = await PATCH(req(`${BASE}/orders/${pending}`, { status: 'cancelled' }, { method: 'PATCH' }), idParams(pending))
    expect(free.status).toBe(200)
  })

  it('quitar un producto ya comandado necesita PIN', async () => {
    const orderId = await createOrder('confirmed')
    const params = { params: Promise.resolve({ tenant: SLUG, id: orderId, productId: PRODUCT_ID }) }
    const url = `${BASE}/orders/${orderId}/items/${PRODUCT_ID}`

    const noPin = await REMOVE_ITEM(req(url, undefined, { method: 'DELETE' }), params)
    expect(noPin.status).toBe(403)
    expect((await noPin.json()).error.code).toBe('approval_required')
  })
})

describe('Fase 2 — el Z para llevarse', () => {
  it('quien abre y cierra queda con su nombre real y su usuario', async () => {
    const cashier = await User.create({
      name: 'Carla Cajera',
      email: `carla-${Math.random().toString(36).slice(2)}@test.com`,
      password: 'x-secret-123',
      phone: `+54${Math.floor(Math.random() * 1e10)}`,
      role: 'cashier',
      tenantId,
      isActive: true,
    })
    const sub = cashier._id.toString()
    const withSub = (url: string, body: unknown) =>
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token('cashier', sub)}`, 'x-location-id': locationId },
        body: JSON.stringify(body),
      }) as unknown as NextRequest

    const opened = await OPEN(withSub(`${BASE}/cash/registers`, { id: crypto.randomUUID(), initialAmount: 0, openedBy: 'Operador' }), tenantParams())
    const reg = (await opened.json()).register
    expect(reg.openedBy).toBe('Carla Cajera')

    await CLOSE(withSub(`${BASE}/cash/registers/${reg.id}/close`, { finalAmount: 0, closedBy: 'Operador' }), idParams(reg.id))
    const saved = await CashRegister.findOne({ posId: reg.id }).lean()
    expect(saved?.closedBy).toBe('Carla Cajera')
    expect(saved?.closedByUserId).toBe(sub)
    expect(saved?.openedByUserId).toBe(sub)
  })

  it('al cerrar, el Z sale a la impresora de caja; se puede reimprimir', async () => {
    await Printer.create({ tenantId, locationId, uid: 'caja-1', name: 'Caja', ip: '192.168.0.60', roles: ['cashier'], paperWidth: 80 })
    const reg = await openRegister()
    const closed = await CLOSE(req(`${BASE}/cash/registers/${reg.id}/close`, { finalAmount: 100000 }), idParams(reg.id))
    expect((await closed.json()).print).toEqual({ ok: true, printerName: 'Caja' })
    expect(await PreClosePrintJob.countDocuments({ tenantId, status: 'pending' })).toBe(1)

    const again = await PRINT_Z(req(`${BASE}/cash/registers/${reg.id}/print`, {}), idParams(reg.id))
    expect(again.status).toBe(200)
    expect(await PreClosePrintJob.countDocuments({ tenantId })).toBe(2)
  })

  it('sin impresora de caja el cierre sigue y avisa', async () => {
    const reg = await openRegister()
    const closed = await CLOSE(req(`${BASE}/cash/registers/${reg.id}/close`, { finalAmount: 100000 }), idParams(reg.id))
    expect(closed.status).toBe(200)
    expect((await closed.json()).print).toEqual({ ok: false, reason: 'no_printer' })
    const reprint = await PRINT_Z(req(`${BASE}/cash/registers/${reg.id}/print`, {}), idParams(reg.id))
    expect(reprint.status).toBe(409)
  })

  it('no se reimprime una caja abierta', async () => {
    const reg = await openRegister()
    const res = await PRINT_Z(req(`${BASE}/cash/registers/${reg.id}/print`, {}), idParams(reg.id))
    expect(res.status).toBe(409)
  })
})
