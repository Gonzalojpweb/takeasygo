import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import Printer from '@/models/Printer'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as createOrder } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as patchOrder } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as fireCourse } from '@/app/api/[tenant]/pos/orders/[id]/courses/route'

/**
 * Piloto 06/11 — tiempos de cocina.
 *   · El mozo comanda entrada + principal; el principal queda EN ESPERA.
 *   · La comanda imprime «MESA n» y el encabezado de espera.
 *   · «Marcha» saca el tiempo de la espera e imprime un ticket corto (sin
 *     repetir los platos). Doble toque: una sola marcha.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'test-tenant'
const ENTRADA = '64b0000000000000000000b1'
const PRINCIPAL = '64b0000000000000000000b2'
const BEBIDA = '64b0000000000000000000b3'

let tenantId: string
let locationId: string
let tablePosId: string

function token(role: 'waiter' | 'cashier'): string {
  return signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: role === 'waiter' ? 'handheld' : 'hub' }, PRIVATE_PEM)
}

function req(url: string, body: unknown, role: 'waiter' | 'cashier' = 'waiter', method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(role)}` },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const base = `http://localhost:3000/api/${SLUG}/pos/orders`
const p = (id?: string) => ({ params: Promise.resolve(id ? { tenant: SLUG, id } : { tenant: SLUG }) }) as never

function round(holdCourses?: string[]) {
  return {
    id: crypto.randomUUID(),
    tableId: tablePosId,
    status: 'pending',
    ...(holdCourses ? { holdCourses } : {}),
    items: [
      { productId: ENTRADA, name: 'Empanada', quantity: 2, unitPrice: 1000, total: 2000, course: 'entrada' },
      { productId: PRINCIPAL, name: 'Bife', quantity: 1, unitPrice: 5000, total: 5000, course: 'principal' },
      { productId: BEBIDA, name: 'Agua', quantity: 1, unitPrice: 800, total: 800 },
    ],
  }
}

async function sendRound(holdCourses?: string[]) {
  const body = round(holdCourses)
  const created = await createOrder(req(base, body), p())
  expect(created.status).toBe(201)
  const confirmed = await patchOrder(req(`${base}/${body.id}`, { status: 'confirmed' }, 'waiter', 'PATCH'), p(body.id))
  expect(confirmed.status).toBe(200)
  return body.id
}

function decodeJobs(order: { printJobs?: { role: string; payload: string }[] } | null) {
  return (order?.printJobs ?? []).map((j) => ({ role: j.role, text: Buffer.from(j.payload, 'base64').toString('latin1') }))
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Local Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  const table = await Table.create({ tenantId, locationId, posId: crypto.randomUUID(), number: 7, capacity: 4, status: 'free' })
  tablePosId = table.posId
  await Menu.create({
    tenantId, locationId, isActive: true,
    categories: [
      { name: 'Cocina', sortOrder: 0, items: [{ _id: ENTRADA, name: 'Empanada', price: 1000 }, { _id: PRINCIPAL, name: 'Bife', price: 5000 }] },
      { name: 'Bebidas', sortOrder: 1, printRole: 'bar', items: [{ _id: BEBIDA, name: 'Agua', price: 800 }] },
    ],
  })
  await Printer.create({ tenantId, locationId, uid: 'p-cocina', name: 'Cocina', ip: '10.0.0.1', isActive: true, roles: ['kitchen'] })
  await Printer.create({ tenantId, locationId, uid: 'p-barra', name: 'Barra', ip: '10.0.0.2', isActive: true, roles: ['bar'] })
  await Printer.create({ tenantId, locationId, uid: 'p-caja', name: 'Caja', ip: '10.0.0.3', isActive: true, roles: ['cashier'] })
})

describe('tiempos de cocina', () => {
  it('comanda: principal en espera, mesa impresa, bebida a la barra y sin ticket de caja', async () => {
    const id = await sendRound(['principal'])
    const order = await Order.findOne({ tenantId, posId: id }).lean()
    expect(order!.heldCourses).toEqual(['principal'])
    expect(order!.posTableNumber).toBe(7)
    const jobs = decodeJobs(order as never)
    expect(jobs.map((j) => j.role).sort()).toEqual(['bar', 'kitchen'])
    const kitchen = jobs.find((j) => j.role === 'kitchen')!.text
    expect(kitchen).toContain('MESA 7')
    expect(kitchen).toContain('EN ESPERA')
    expect(kitchen).toContain('BIFE')
  })

  it('marcha: imprime solo el aviso en cocina, sin repetir los platos, y saca el tiempo de la espera', async () => {
    const id = await sendRound(['principal'])
    const before = (await Order.findOne({ tenantId, posId: id }).lean())!.printJobs!.length

    const res = await fireCourse(req(`${base}/${id}/courses`, { course: 'principal' }), p(id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.printed).toBe(1)
    expect(body.order.heldCourses).toBeUndefined()
    expect(body.order.courseFires[0].course).toBe('principal')

    const order = await Order.findOne({ tenantId, posId: id }).lean()
    const fire = decodeJobs(order as never).slice(before)
    expect(fire).toHaveLength(1)
    expect(fire[0].role).toBe('kitchen')
    expect(fire[0].text).toContain('MARCHA')
    expect(fire[0].text).toContain('PRINCIPAL')
    expect(fire[0].text).toContain('MESA 7')
    expect(fire[0].text).not.toContain('BIFE')
  })

  it('doble toque: una sola marcha', async () => {
    const id = await sendRound(['principal'])
    await fireCourse(req(`${base}/${id}/courses`, { course: 'principal' }), p(id))
    const again = await fireCourse(req(`${base}/${id}/courses`, { course: 'principal' }), p(id))
    expect(again.status).toBe(200)
    expect((await again.json()).alreadyFired).toBe(true)
    const order = await Order.findOne({ tenantId, posId: id }).lean()
    expect(order!.courseFires).toHaveLength(1)
  })

  it('un POS viejo (sin holdCourses) no deja nada en espera', async () => {
    const id = await sendRound()
    const order = await Order.findOne({ tenantId, posId: id }).lean()
    expect(order!.heldCourses ?? []).toEqual([])
  })

  it('no se puede poner en espera un tiempo que no está en la ronda', async () => {
    const body = { ...round(['postre']) }
    const res = await createOrder(req(base, body), p())
    expect(res.status).toBe(400)
  })

  it('marchar un tiempo que nunca estuvo en espera responde 409', async () => {
    const id = await sendRound()
    const res = await fireCourse(req(`${base}/${id}/courses`, { course: 'principal' }), p(id))
    expect(res.status).toBe(409)
  })
})
