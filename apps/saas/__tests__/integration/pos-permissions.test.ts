import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Table from '@/models/Table'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as CREATE_ORDER } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as PATCH_ORDER } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as PAY } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { POST as OPEN_CASH, GET as LIST_CASH } from '@/app/api/[tenant]/pos/cash/registers/route'
import { PATCH as PATCH_TABLE } from '@/app/api/[tenant]/pos/tables/[id]/route'
import { GET as MENU } from '@/app/api/[tenant]/pos/menu/route'
import { resolvePosRole, hasPosCapability } from '@/lib/pos-online/permissions'

/**
 * Matriz de permisos del POS (Operational Roles Matrix del ROS).
 * Hallazgo: ninguna ruta /pos/* controlaba el rol. Con el POS mobile para
 * mozos, un celular de `staff` podía abrir caja y registrar cobros.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'perm-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
const PRODUCT_ID = '64b0000000000000000000aa'
let tenantId: string
let tablePosId: string

function token(role: string): string {
  return signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: role === 'waiter' ? 'handheld' : 'hub' } as never, PRIVATE_PEM)
}
function req(url: string, role: string, body?: unknown, method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(role)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}
const tp = () => ({ params: Promise.resolve({ tenant: SLUG }) })
const ip = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

async function createOrder(role: string): Promise<{ status: number; id: string }> {
  const id = crypto.randomUUID()
  const res = await CREATE_ORDER(
    req(`${BASE}/orders`, role, {
      id,
      tableId: tablePosId,
      items: [{ productId: PRODUCT_ID, name: 'Milanesa', quantity: 1, unitPrice: 1000, total: 1000 }],
    }),
    tp()
  )
  return { status: res.status, id }
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Perm', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Local', slug: 'local', address: 'x', isActive: true })
  await Menu.create({
    tenantId,
    locationId: loc._id,
    isActive: true,
    categories: [{ name: 'Platos', sortOrder: 0, items: [{ _id: PRODUCT_ID, name: 'Milanesa', price: 1000 }] }],
  })
  const table = await Table.create({ tenantId, locationId: loc._id, posId: crypto.randomUUID(), number: 1, capacity: 4, status: 'free' })
  tablePosId = table.posId
})

describe('mozo (waiter, celular)', () => {
  it('lee el menú, toma el pedido y lo manda a cocina', async () => {
    expect((await MENU(req(`${BASE}/menu`, 'waiter', undefined, 'GET'), tp())).status).toBe(200)
    const { status, id } = await createOrder('waiter')
    expect(status).toBe(201)
    const confirm = await PATCH_ORDER(req(`${BASE}/orders/${id}`, 'waiter', { status: 'confirmed' }, 'PATCH'), ip(id))
    expect(confirm.status).toBe(200)
  })

  it('ocupa la mesa y pide la cuenta', async () => {
    const occupy = await PATCH_TABLE(req(`${BASE}/tables/${tablePosId}`, 'waiter', { status: 'occupied' }, 'PATCH'), ip(tablePosId))
    expect(occupy.status).toBe(200)
    const bill = await PATCH_TABLE(req(`${BASE}/tables/${tablePosId}`, 'waiter', { needsBill: true }, 'PATCH'), ip(tablePosId))
    expect(bill.status).toBe(200)
  })

  it('NO cobra, NO opera caja, NO cancela, NO entrega, NO libera mesas', async () => {
    const { id } = await createOrder('waiter')
    expect((await PAY(req(`${BASE}/orders/${id}/payments`, 'waiter', { payments: [{ id: crypto.randomUUID(), method: 'cash', amount: 1000 }] }), ip(id))).status).toBe(403)
    expect((await PATCH_ORDER(req(`${BASE}/orders/${id}`, 'waiter', { status: 'cancelled' }, 'PATCH'), ip(id))).status).toBe(403)
    expect((await PATCH_ORDER(req(`${BASE}/orders/${id}`, 'waiter', { status: 'delivered' }, 'PATCH'), ip(id))).status).toBe(403)
    expect((await OPEN_CASH(req(`${BASE}/cash/registers`, 'waiter', { id: crypto.randomUUID(), initialAmount: 100 }), tp())).status).toBe(403)
    expect((await LIST_CASH(req(`${BASE}/cash/registers`, 'waiter', undefined, 'GET'), tp())).status).toBe(403)

    await PATCH_TABLE(req(`${BASE}/tables/${tablePosId}`, 'waiter', { status: 'reserved' }, 'PATCH'), ip(tablePosId)).then((r) =>
      expect(r.status).toBe(403)
    )
  })
})

describe('cajero (hub)', () => {
  it('cobra y opera caja', async () => {
    const { id } = await createOrder('cashier')
    const pay = await PAY(req(`${BASE}/orders/${id}/payments`, 'cashier', { payments: [{ id: crypto.randomUUID(), method: 'cash', amount: 1000 }] }), ip(id))
    expect(pay.status).toBe(201)
    expect((await LIST_CASH(req(`${BASE}/cash/registers`, 'cashier', undefined, 'GET'), tp())).status).toBe(200)
  })
})

describe('resolvePosRole / capacidades', () => {
  it('traduce roles del SaaS y niega lo desconocido', () => {
    expect(resolvePosRole('staff')).toBe('waiter')
    expect(resolvePosRole('superadmin')).toBe('admin')
    expect(resolvePosRole('consumer')).toBeNull()
    // Fase 0 (29/10): recepción entra como mozo y el encargado de operaciones
    // como encargado; cocina y auditor todavía no tienen rol POS.
    expect(resolvePosRole('host')).toBe('waiter')
    expect(resolvePosRole('operations_manager')).toBe('manager')
    expect(resolvePosRole('kitchen_lead')).toBeNull()
    expect(resolvePosRole('rol_inventado')).toBeNull()
    expect(resolvePosRole('__proto__')).toBeNull()
    expect(hasPosCapability('staff', 'cash.write')).toBe(false)
    expect(hasPosCapability('auditor', 'orders.read')).toBe(false)
  })
})
