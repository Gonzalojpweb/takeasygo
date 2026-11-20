import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import Table from '@/models/Table'
import User from '@/models/User'
import Printer from '@/models/Printer'
import AuditLog from '@/models/AuditLog'
import { signJwt } from '@takeasygo/business/jwt'
import { posPinLookup } from '@takeasygo/business/pos-pin'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { computeSalesMetrics } from '@/lib/metrics/sales'
import type { NextRequest } from 'next/server'

import { POST as CREATE } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as PATCH_ORDER } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as PAY } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { DELETE as REMOVE_ITEM } from '@/app/api/[tenant]/pos/orders/[id]/items/[productId]/route'
import { POST as REPRINT } from '@/app/api/[tenant]/pos/orders/[id]/reprint/route'
import { PATCH as PATCH_TABLE } from '@/app/api/[tenant]/pos/tables/[id]/route'
import { POST as VOID_TABLE } from '@/app/api/[tenant]/pos/tables/[id]/void/route'

/**
 * Pedido del dueño (19/11/2026):
 *   1. Anular una mesa entera (sin cobrar) — la autoriza admin/encargado,
 *      con motivo, registro e inventario (stock o merma) y aviso a cocina.
 *   2. Quitar todos los platos dejaba la mesa amarilla: ahora la ronda vacía
 *      se cancela y la mesa vuelve a libre.
 *   3. Mozo y cajero piden; un admin/encargado autoriza con su PIN en ese
 *      equipo, sin cerrar sesión (elevación en posRoute).
 *   4. Reimprimir COMANDAS desde el POS, marcadas «REIMPRESIÓN».
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PEPPER = 'pepper-de-test-de-al-menos-16'

const SLUG = 'mesa-anulada'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
const OPERATOR_ID = '64b0000000000000000000c1'
const PRODUCT_ID = '64b0000000000000000000aa'
const MANAGER_PIN = '482913'

type Role = 'cashier' | 'manager' | 'waiter'

let tenantId: string
let locationId: string
let managerId: string
let tablePosId: string

function token(role: Role): string {
  return signJwt({ sub: OPERATOR_ID, tenantId, role, deviceType: role === 'waiter' ? 'handheld' : 'hub' } as never, PRIVATE_PEM)
}

function req(url: string, body: unknown, opts: { method?: string; role?: Role; pin?: string } = {}): NextRequest {
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
const itemParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id, productId: PRODUCT_ID }) })

async function round(status: 'pending' | 'confirmed' = 'confirmed', quantity = 2): Promise<string> {
  const id = crypto.randomUUID()
  const res = await CREATE(
    req(`${BASE}/orders`, {
      id,
      status,
      tableId: tablePosId,
      items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity, unitPrice: 1500, total: 1500 * quantity }],
    }),
    tenantParams()
  )
  expect(res.status).toBe(201)
  await Table.updateOne({ posId: tablePosId }, { $set: { status: 'occupied', currentOrderId: id, guests: 2 } })
  return id
}

function voidTable(body: unknown, opts: { role?: Role; pin?: string } = {}) {
  return VOID_TABLE(req(`${BASE}/tables/${tablePosId}/void`, body, opts), idParams(tablePosId))
}

function decodeJobs(order: { printJobs?: { role: string; payload: string; isReprint?: boolean }[] } | null) {
  return (order?.printJobs ?? []).map((j) => ({ role: j.role, isReprint: j.isReprint, text: Buffer.from(j.payload, 'base64').toString('latin1') }))
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
  const tenant = await Tenant.create({ name: 'Mesa Anulada', slug: SLUG, plan: 'full' })
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
  const table = await Table.create({ tenantId, locationId, posId: crypto.randomUUID(), number: 7, capacity: 4, status: 'free' })
  tablePosId = table.posId
  await Printer.create({ tenantId, locationId, uid: 'p-cocina', name: 'Cocina', ip: '10.0.0.1', isActive: true, roles: ['kitchen'] })
})

describe('quitar todos los platos → la mesa vuelve a verde', () => {
  it('la ronda vacía se cancela sola y la mesa queda libre', async () => {
    const id = await round('confirmed')
    const res = await REMOVE_ITEM(
      req(`${BASE}/orders/${id}/items/${PRODUCT_ID}?reason=load_error`, undefined, { method: 'DELETE', role: 'manager' }),
      itemParams(id)
    )
    expect(res.status).toBe(200)
    expect((await res.json()).order.status).toBe('cancelled')
    const stored = await Order.findOne({ posId: id }).lean()
    expect(stored!.status).toBe('cancelled')
    expect(stored!.itemVoids).toHaveLength(1)
    expect(await Table.findOne({ posId: tablePosId }).lean()).toMatchObject({ status: 'free', currentOrderId: null, guests: null })
  })

  it('con otra ronda abierta, la mesa sigue ocupada', async () => {
    await round('confirmed')
    const second = await round('confirmed', 1)
    await REMOVE_ITEM(
      req(`${BASE}/orders/${second}/items/${PRODUCT_ID}?reason=load_error`, undefined, { method: 'DELETE', role: 'manager' }),
      itemParams(second)
    )
    expect((await Order.findOne({ posId: second }).lean())!.status).toBe('cancelled')
    expect((await Table.findOne({ posId: tablePosId }).lean())!.status).toBe('occupied')
  })

  it('cancelar la última ronda libera la mesa aunque no sea la vinculada', async () => {
    const first = await round('pending')
    const second = await round('pending', 1)
    // La mesa quedó vinculada a la segunda: se cancela la primera y después la segunda.
    expect((await PATCH_ORDER(req(`${BASE}/orders/${first}`, { status: 'cancelled' }, { method: 'PATCH' }), idParams(first))).status).toBe(200)
    expect((await Table.findOne({ posId: tablePosId }).lean())!.status).toBe('occupied')
    await Table.updateOne({ posId: tablePosId }, { $set: { currentOrderId: first } })
    expect((await PATCH_ORDER(req(`${BASE}/orders/${second}`, { status: 'cancelled' }, { method: 'PATCH' }), idParams(second))).status).toBe(200)
    expect((await Table.findOne({ posId: tablePosId }).lean())!.status).toBe('free')
  })
})

describe('anular la mesa entera', () => {
  it('cajero sin PIN → approval_required; con PIN del encargado: rondas canceladas, registro, mesa libre y aviso a cocina', async () => {
    const sent = await round('confirmed')
    const notSent = await round('pending', 1)

    const noPin = await voidTable({ reason: 'customer_left', note: 'se fueron al toque' })
    expect(noPin.status).toBe(403)
    expect((await noPin.json()).error.code).toBe('approval_required')
    expect((await Order.findOne({ posId: sent }).lean())!.status).toBe('confirmed')

    const res = await voidTable({ reason: 'customer_left', note: 'se fueron al toque' }, { pin: MANAGER_PIN })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.voided).toMatchObject({ rounds: 2, amount: 4500, wasted: false, printed: 1 })
    expect(body.table.status).toBe('free')

    const a = await Order.findOne({ posId: sent }).lean()
    const b = await Order.findOne({ posId: notSent }).lean()
    expect(a!.status).toBe('cancelled')
    expect(b!.status).toBe('cancelled')
    expect(a!.tableVoid).toMatchObject({
      reason: 'customer_left',
      note: 'se fueron al toque',
      by: OPERATOR_ID,
      byRole: 'cashier',
      approvedBy: managerId,
      viaPin: true,
      wasted: false,
      amount: 3000,
      previousStatus: 'confirmed',
      tableNumber: 7,
    })
    expect(b!.tableVoid!.previousStatus).toBe('pending')
    expect(a!.tableVoid!.voidId).toBe(b!.tableVoid!.voidId)
    // Platos que siguen en la orden: queda el detalle de qué se anuló.
    expect(a!.items).toHaveLength(1)

    // Aviso a cocina solo de la ronda que se había mandado.
    const notice = decodeJobs(a as never).find((j) => j.text.includes('ANULADA'))
    expect(notice).toBeDefined()
    expect(notice!.isReprint).toBe(true)
    expect(notice!.text).toContain('MESA 7')
    expect(notice!.text).toContain('NO PREPARAR')
    expect(decodeJobs(b as never).some((j) => j.text.includes('ANULADA'))).toBe(false)

    expect(await Table.findOne({ posId: tablePosId }).lean()).toMatchObject({ status: 'free', currentOrderId: null, guests: null })
    const audit = await AuditLog.findOne({ action: 'pos.table.void' }).lean()
    expect(audit).toBeTruthy()
  })

  it('el encargado la anula directo y elige merma', async () => {
    const id = await round('confirmed')
    const res = await voidTable({ reason: 'complaint', wasted: true }, { role: 'manager' })
    expect(res.status).toBe(200)
    const stored = await Order.findOne({ posId: id }).lean()
    expect(stored!.tableVoid).toMatchObject({ reason: 'complaint', wasted: true, viaPin: false, byRole: 'manager' })
  })

  it('el mozo la pide desde su equipo con el PIN del encargado', async () => {
    const id = await round('confirmed')
    const noPin = await voidTable({ reason: 'load_error' }, { role: 'waiter' })
    expect((await noPin.json()).error.code).toBe('approval_required')
    const res = await voidTable({ reason: 'load_error' }, { role: 'waiter', pin: MANAGER_PIN })
    expect(res.status).toBe(200)
    expect((await Order.findOne({ posId: id }).lean())!.tableVoid).toMatchObject({ byRole: 'waiter', approvedBy: managerId })
  })

  it('motivo obligatorio; «Otro» exige escribirlo', async () => {
    await round('confirmed')
    expect((await voidTable({}, { role: 'manager' })).status).toBe(400)
    expect((await voidTable({ reason: 'other' }, { role: 'manager' })).status).toBe(400)
    expect((await voidTable({ reason: 'other', note: 'prueba de sistema' }, { role: 'manager' })).status).toBe(200)
  })

  it('una ronda ya cobrada no se anula acá (se anula la venta)', async () => {
    const id = await round('confirmed')
    const paid = await PAY(
      req(`${BASE}/orders/${id}/payments`, { payments: [{ id: crypto.randomUUID(), method: 'cash', amount: 3000 }] }),
      idParams(id)
    )
    expect(paid.status).toBe(201)
    const res = await voidTable({ reason: 'load_error' }, { role: 'manager' })
    expect(res.status).toBe(409)
  })

  it('mesa amarilla con rondas vacías: la caja la libera sin motivo', async () => {
    const id = await round('confirmed')
    await Order.updateOne({ posId: id }, { $set: { items: [], total: 0, subtotal: 0 } })
    const res = await voidTable({})
    expect(res.status).toBe(200)
    expect((await Table.findOne({ posId: tablePosId }).lean())!.status).toBe('free')
    expect((await Order.findOne({ posId: id }).lean())!.status).toBe('cancelled')
  })

  it('la anulación cuenta en las métricas: una mesa, importe y merma', async () => {
    await round('confirmed')
    await round('confirmed', 1)
    await voidTable({ reason: 'complaint', wasted: true }, { role: 'manager' })
    const orders = await Order.find({ tenantId }).lean()
    const m = computeSalesMetrics(orders as never)
    expect(m.totals.tableVoids).toEqual({ count: 1, amount: 4500, wasteAmount: 4500 })
    expect(m.totals.sales).toBe(0)
  })
})

describe('autorización sin cerrar sesión (elevación)', () => {
  it('el mozo cancela un pedido o libera una mesa solo con el PIN', async () => {
    const id = await round('pending')
    const noPin = await PATCH_ORDER(req(`${BASE}/orders/${id}`, { status: 'cancelled' }, { method: 'PATCH', role: 'waiter' }), idParams(id))
    expect(noPin.status).toBe(403)
    expect((await noPin.json()).error.code).toBe('approval_required')
    const ok = await PATCH_ORDER(req(`${BASE}/orders/${id}`, { status: 'cancelled' }, { method: 'PATCH', role: 'waiter', pin: MANAGER_PIN }), idParams(id))
    expect(ok.status).toBe(200)
    expect((await Table.findOne({ posId: tablePosId }).lean())!.status).toBe('free')

    await Table.updateOne({ posId: tablePosId }, { $set: { status: 'occupied', currentOrderId: null } })
    const release = await PATCH_TABLE(req(`${BASE}/tables/${tablePosId}`, { status: 'free' }, { method: 'PATCH', role: 'waiter', pin: MANAGER_PIN }), idParams(tablePosId))
    expect(release.status).toBe(200)
  })

  it('un PIN incorrecto no autoriza', async () => {
    const id = await round('pending')
    const bad = await PATCH_ORDER(req(`${BASE}/orders/${id}`, { status: 'cancelled' }, { method: 'PATCH', role: 'waiter', pin: '000000' }), idParams(id))
    expect(bad.status).toBe(403)
    expect((await bad.json()).error.code).toBe('approval_invalid')
  })

  it('cobrar NO se delega: el mozo no cobra ni con PIN', async () => {
    const id = await round('confirmed')
    const res = await PAY(
      req(`${BASE}/orders/${id}/payments`, { payments: [{ id: crypto.randomUUID(), method: 'cash', amount: 3000 }] }, { role: 'waiter', pin: MANAGER_PIN }),
      idParams(id)
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
  })
})

describe('reimprimir la comanda', () => {
  it('la caja la reimprime marcada «REIMPRESIÓN»; no pisa la comanda original', async () => {
    const id = await round('confirmed')
    const before = (await Order.findOne({ posId: id }).lean())!.printJobs?.length ?? 0
    const res = await REPRINT(req(`${BASE}/orders/${id}/reprint`, { station: 'kitchen' }), idParams(id))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, jobs: 1, printers: ['Cocina'] })
    const jobs = decodeJobs((await Order.findOne({ posId: id }).lean()) as never)
    expect(jobs).toHaveLength(before + 1)
    const last = jobs.at(-1)!
    expect(last.isReprint).toBe(true)
    expect(last.text).toContain('REIMPRESI')
    expect(last.text).toContain('NO PREPARAR DE NUEVO')
    expect(last.text).toContain('HAMBURGUESA')
  })

  it('ronda sin enviar o anulada → 409; estación sin impresora → 409', async () => {
    const pending = await round('pending')
    expect((await REPRINT(req(`${BASE}/orders/${pending}/reprint`, {}), idParams(pending))).status).toBe(409)
    const sent = await round('confirmed')
    expect((await REPRINT(req(`${BASE}/orders/${sent}/reprint`, { station: 'bar' }), idParams(sent))).status).toBe(409)
    await voidTable({ reason: 'load_error' }, { role: 'manager' })
    expect((await REPRINT(req(`${BASE}/orders/${sent}/reprint`, {}), idParams(sent))).status).toBe(409)
  })

  it('el mozo la pide con el PIN de un encargado', async () => {
    const id = await round('confirmed')
    const noPin = await REPRINT(req(`${BASE}/orders/${id}/reprint`, {}, { role: 'waiter' }), idParams(id))
    expect((await noPin.json()).error.code).toBe('approval_required')
    const ok = await REPRINT(req(`${BASE}/orders/${id}/reprint`, {}, { role: 'waiter', pin: MANAGER_PIN }), idParams(id))
    expect(ok.status).toBe(200)
  })
})
