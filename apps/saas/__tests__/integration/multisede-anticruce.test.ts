// ============================================================================
// multisede-anticruce.test.ts — Aislamiento por sede (Oleada 1)
// ============================================================================
// Los 3 cruces como aserciones ejecutables, ahora con el guard cableado
// DETRÁS DE FLAG (`multisede.strictLocationId`):
//   Cruce #1 POST /orders (sede ajena)     → 403 con flag ON
//   Cruce #2 GET  /reservas (por query)    → 403 con flag ON
//   Cruce #3 GET  /orders admin (multisede)→ 403 sede ajena / listado acotado
//
// Regla "no romper lo que funciona": con flag OFF el comportamiento es el
// actual (se testea explícitamente como no-regresión).
//
// Ejecutar: pnpm --filter @takeasygo/saas test -- multisede-anticruce
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/reservationNotifications', () => ({
  sendReservationConfirmation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}))

import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { GET as listReservations } from '@/app/api/[tenant]/reservas/route'
import { POST as createOrder, GET as listOrders } from '@/app/api/[tenant]/orders/route'
import { auth } from '@/lib/auth'
import { canAccessLocation } from '@/lib/location-scope'

let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  tenant = await Tenant.create({
    slug: 'chopis-test',
    name: 'Chopis (test)',
    isActive: true,
    status: 'active',
    plan: 'full',
    features: { reservations: true },
    // Flag Oleada 1 ON por defecto en el fixture; los tests de no-regresión la apagan.
    flags: { 'multisede.strictLocationId': true },
  })
  loc1 = await Location.create({
    tenantId: tenant._id,
    slug: 'sede-a',
    name: 'Sede A',
    address: 'Av Test 1000',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: { enabled: true },
  })
  loc2 = await Location.create({
    tenantId: tenant._id,
    slug: 'sede-b',
    name: 'Sede B',
    address: 'Av Test 2000',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: { enabled: true },
  })
})

async function setStrictFlag(value: boolean | 'off' | 'log' | 'enforce') {
  tenant.flags = { 'multisede.strictLocationId': value }
  tenant.markModified('flags')
  await tenant.save()
}

async function seedOrders() {
  await Order.collection.insertMany([
    {
      tenantId: tenant._id,
      locationId: loc1._id,
      orderNumber: 'TEST-L1-1',
      status: 'confirmed',
      deletedAt: null,
      customer: { name: 'enc-l1', phone: 'enc', email: 'enc' },
      total: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      tenantId: tenant._id,
      locationId: loc2._id,
      orderNumber: 'TEST-L2-1',
      status: 'confirmed',
      deletedAt: null,
      customer: { name: 'enc-l2', phone: 'enc', email: 'enc' },
      total: 200,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])
}

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}

function makeRequest(search: string): NextRequest {
  return new NextRequest(`http://localhost/api/chopis-test/reservas${search}`)
}

function makeParams() {
  return { params: Promise.resolve({ tenant: 'chopis-test' }) }
}

function makeOrderRequest(locationId: string): NextRequest {
  return new NextRequest('http://localhost/api/chopis-test/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      locationId,
      items: [{ type: 'menuItem', quantity: 1 }],
      customer: { name: 'Cliente Test' },
      mode: 'takeaway',
    }),
  })
}

function makeOrdersRequest(search: string): NextRequest {
  return new NextRequest(`http://localhost/api/chopis-test/orders${search}`)
}

describe('guard canAccessLocation — matriz 2×2 (sede × rol)', () => {
  it('usuario scoped a L1: accede a L1, rechaza L2 (cruce de sede)', () => {
    const scoped = { role: 'manager', assignedLocations: [loc1._id.toString()] }
    expect(canAccessLocation(scoped, loc1._id.toString())).toBe(true)
    expect(canAccessLocation(scoped, loc2._id.toString())).toBe(false)
  })

  it('usuario sin alcance (legacy single-sede): acceso total a ambas (no regresión)', () => {
    const unscoped = { role: 'manager', assignedLocations: [] }
    expect(canAccessLocation(unscoped, loc1._id.toString())).toBe(true)
    expect(canAccessLocation(unscoped, loc2._id.toString())).toBe(true)
  })

  it('admin scoped a L1: igual que manager — no puede leer L2', () => {
    const admin = { role: 'admin', assignedLocations: [loc1._id.toString()] }
    expect(canAccessLocation(admin, loc2._id.toString())).toBe(false)
  })

  it('superadmin: acceso total siempre', () => {
    const sup = { role: 'superadmin', assignedLocations: [] }
    expect(canAccessLocation(sup, loc2._id.toString())).toBe(true)
  })

  it('usuario sin sesión: rechaza', () => {
    expect(canAccessLocation(null, loc1._id.toString())).toBe(false)
  })
})

describe('Cruce #2 — GET /reservas con sede ajena', () => {
  it('flag ON: usuario scoped a L1 + locationId=L2 → 403', async () => {
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await listReservations(makeRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(403)
  })

  it('flag ON: usuario scoped a L1 + locationId=L1 → 200 (su propia sede)', async () => {
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await listReservations(makeRequest(`?locationId=${loc1._id.toString()}`), makeParams())
    expect(res.status).toBe(200)
  })

  it('flag ON: usuario legacy sin alcance + locationId=L2 → 200 (no regresión)', async () => {
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await listReservations(makeRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(200)
  })

  it('flag OFF: usuario scoped a L1 + locationId=L2 → 200 (comportamiento actual)', async () => {
    await setStrictFlag(false)
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await listReservations(makeRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(200)
  })

  it('locationId malformado → 400 (sin CastError/500)', async () => {
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await listReservations(makeRequest('?locationId=not-an-objectid'), makeParams())
    expect(res.status).toBe(400)
  })

  it('NoSQL injection: locationId[$ne]=x → 200 y NO filtra por el objeto inyectado', async () => {
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [],
      assignedTenants: [tenant._id.toString()],
    })
    // El query string con corchetes NO es parseado como objeto por searchParams.get.
    const res = await listReservations(makeRequest('?locationId%5B%24ne%5D=null'), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.reservations)).toBe(true)
  })
})

describe('Cruce #1 — POST /orders con sede ajena (detrás de flag)', () => {
  it('flag ON: operador scoped a L1 + locationId=L2 → 403', async () => {
    setSessionUser({
      id: 'pos-1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await createOrder(makeOrderRequest(loc2._id.toString()), makeParams())
    expect(res.status).toBe(403)
  })

  it('flag ON: operador scoped a L1 + locationId=L1 → NO 403 (su sede)', async () => {
    setSessionUser({
      id: 'pos-1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await createOrder(makeOrderRequest(loc1._id.toString()), makeParams())
    expect(res.status).not.toBe(403)
  })

  it('flag OFF: operador scoped a L1 + locationId=L2 → NO 403 (comportamiento actual)', async () => {
    await setStrictFlag(false)
    setSessionUser({
      id: 'pos-1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await createOrder(makeOrderRequest(loc2._id.toString()), makeParams())
    expect(res.status).not.toBe(403)
  })

  it('flag ON: checkout público sin sesión + L2 → NO 403 (público no se ve afectado)', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await createOrder(makeOrderRequest(loc2._id.toString()), makeParams())
    expect(res.status).not.toBe(403)
  })
})

describe('Cruce #3 — GET /orders admin (multisede)', () => {
  function setAdmin(assignedLocations: string[], role = 'admin') {
    setSessionUser({
      id: 'admin-1',
      role,
      tenantId: tenant._id.toString(),
      assignedLocations,
      assignedTenants: [tenant._id.toString()],
    })
  }

  it('flag ON: admin scoped a L1 + locationId=L2 → 403', async () => {
    await seedOrders()
    setAdmin([loc1._id.toString()])
    const res = await listOrders(makeOrdersRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(403)
  })

  it('flag ON: admin scoped a L1 sin locationId → 200 y solo ve pedidos de L1', async () => {
    await seedOrders()
    setAdmin([loc1._id.toString()])
    const res = await listOrders(makeOrdersRequest(''), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders).toHaveLength(1)
    expect(body.orders[0].locationId.toString()).toBe(loc1._id.toString())
  })

  it('flag ON: admin SIN sedes asignadas → 200 y ve todo el tenant (no regresión)', async () => {
    await seedOrders()
    setAdmin([])
    const res = await listOrders(makeOrdersRequest(''), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders).toHaveLength(2)
  })

  it('flag ON: superadmin ve todas las sedes', async () => {
    await seedOrders()
    setAdmin([], 'superadmin')
    const res = await listOrders(makeOrdersRequest(''), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders).toHaveLength(2)
  })

  it('flag OFF: admin scoped a L1 + locationId=L2 → 200 (comportamiento actual)', async () => {
    await setStrictFlag(false)
    await seedOrders()
    setAdmin([loc1._id.toString()])
    const res = await listOrders(makeOrdersRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders).toHaveLength(1)
  })
})

describe('Flag de 3 valores — modo LOG (observar sin bloquear)', () => {
  it('GET /reservas cross-sede: 200 (no bloquea) y registra el intento', async () => {
    await setStrictFlag('log')
    setSessionUser({
      id: 'u1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await listReservations(makeRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(200)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('POST /orders cross-sede: NO 403 (no bloquea en modo log)', async () => {
    await setStrictFlag('log')
    setSessionUser({
      id: 'pos-1',
      role: 'manager',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await createOrder(makeOrderRequest(loc2._id.toString()), makeParams())
    expect(res.status).not.toBe(403)
  })

  it('GET /orders admin cross-sede: 200 (no bloquea ni restringe en modo log)', async () => {
    await setStrictFlag('log')
    await seedOrders()
    setSessionUser({
      id: 'admin-1',
      role: 'admin',
      tenantId: tenant._id.toString(),
      assignedLocations: [loc1._id.toString()],
      assignedTenants: [tenant._id.toString()],
    })
    const res = await listOrders(makeOrdersRequest(`?locationId=${loc2._id.toString()}`), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders).toHaveLength(1)
  })
})