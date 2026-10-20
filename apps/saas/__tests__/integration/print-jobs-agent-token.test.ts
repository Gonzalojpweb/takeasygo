// ============================================================================
// print-jobs-agent-token.test.ts — Token del agente por sede (P-1)
// ============================================================================
// - Sede sin token generado: poll y confirmación funcionan sin token (legacy).
// - Sede con token: sin token / token inválido → 401; token correcto → 200.
// - La confirmación (POST) toma la sede del pedido, no del request.
// - Generar/revocar token: solo admin del tenant y dentro de su alcance.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import { GET as pollJobs, POST as ackJob } from '@/app/api/[tenant]/print-jobs/route'
import { POST as generateToken, DELETE as revokeToken } from '@/app/api/[tenant]/locations/[locationId]/agent-token/route'
import { auth } from '@/lib/auth'
import { hashAgentToken } from '@/lib/printer-agent-auth'

const SLUG = 'chopis-test'
let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Chopis', isActive: true, status: 'active', plan: 'full' })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'Sede A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'Sede B', address: 'B', isActive: true })
})

const params = { params: Promise.resolve({ tenant: SLUG }) }

function poll(locationId: string, token?: string) {
  const headers: Record<string, string> = { 'X-Agent-Version': '2.1.0' }
  if (token) headers['X-Agent-Token'] = token
  return pollJobs(new NextRequest(`http://localhost/api/${SLUG}/print-jobs?locationId=${locationId}`, { headers }), params)
}

function ack(body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['X-Agent-Token'] = token
  return ackJob(new NextRequest(`http://localhost/api/${SLUG}/print-jobs`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }), params)
}

async function setToken(loc: any, raw: string) {
  await Location.updateOne({ _id: loc._id }, { $set: { 'printerAgent.secretHash': hashAgentToken(raw) } })
}

async function seedOrder(locationId: unknown) {
  const order = await Order.create({
    tenantId: tenant._id,
    locationId,
    orderNumber: `P-${String(locationId).slice(-4)}`,
    status: 'confirmed',
    orderMode: 'takeaway',
    items: [{
      itemType: 'menuItem', name: 'Hamburguesa', categoryName: 'Platos', basePrice: 5000,
      price: 5000, quantity: 1, subtotal: 5000, printRole: 'kitchen', customizations: [],
    }],
    subtotal: 5000,
    total: 5000,
    customer: { name: 'Cliente Test' },
    printJobs: [],
  })
  return order._id.toString()
}

describe('print-jobs GET — token por sede', () => {
  it('sede sin token generado: poll sin token → 200 (legacy)', async () => {
    expect((await poll(loc1._id.toString())).status).toBe(200)
  })

  it('sede con token: poll sin token → 401', async () => {
    await setToken(loc1, 'tga_correcto')
    expect((await poll(loc1._id.toString())).status).toBe(401)
  })

  it('sede con token: token inválido → 401', async () => {
    await setToken(loc1, 'tga_correcto')
    expect((await poll(loc1._id.toString(), 'tga_otro')).status).toBe(401)
  })

  it('sede con token: token correcto → 200', async () => {
    await setToken(loc1, 'tga_correcto')
    expect((await poll(loc1._id.toString(), 'tga_correcto')).status).toBe(200)
  })

  it('el token de la sede A no sirve para la sede B', async () => {
    await setToken(loc1, 'tga_de_a')
    await setToken(loc2, 'tga_de_b')
    expect((await poll(loc2._id.toString(), 'tga_de_a')).status).toBe(401)
  })
})

describe('print-jobs POST — la sede sale del pedido', () => {
  it('pedido de sede con token: confirmación sin token → 401 y no toca el pedido', async () => {
    await setToken(loc1, 'tga_correcto')
    const orderId = await seedOrder(loc1._id)
    const res = await ack({ orderId, printerName: 'Cocina', role: 'kitchen', success: true })
    expect(res.status).toBe(401)
    const order = await Order.findById(orderId).lean() as any
    expect(order.printLog).toHaveLength(0)
  })

  it('pedido de sede con token: confirmación con token → 200', async () => {
    await setToken(loc1, 'tga_correcto')
    const orderId = await seedOrder(loc1._id)
    const res = await ack({ orderId, printerName: 'Cocina', role: 'kitchen', success: true }, 'tga_correcto')
    expect(res.status).toBe(200)
  })

  it('pedido de sede sin token: confirmación sin token → 200 (legacy)', async () => {
    const orderId = await seedOrder(loc2._id)
    const res = await ack({ orderId, printerName: 'Cocina', role: 'kitchen', success: true })
    expect(res.status).toBe(200)
  })
})

describe('agent-token — generar y revocar', () => {
  function setSessionUser(user: Record<string, unknown>) {
    vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
  }
  const tokenParams = (locationId: string) => ({ params: Promise.resolve({ tenant: SLUG, locationId }) })
  const req = (locationId: string, method: string) =>
    new NextRequest(`http://localhost/api/${SLUG}/locations/${locationId}/agent-token`, { method })

  it('admin genera token: se guarda solo el hash y el poll pasa a exigirlo', async () => {
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await generateToken(req(loc1._id.toString(), 'POST'), tokenParams(loc1._id.toString()))
    expect(res.status).toBe(200)
    const { token } = await res.json()
    expect(token).toMatch(/^tga_[0-9a-f]{48}$/)

    const stored = await Location.findById(loc1._id).lean() as any
    expect(stored.printerAgent.secretHash).toBe(hashAgentToken(token))
    expect(JSON.stringify(stored)).not.toContain(token)

    expect((await poll(loc1._id.toString())).status).toBe(401)
    expect((await poll(loc1._id.toString(), token)).status).toBe(200)
  })

  it('revocar vuelve la sede al modo sin token', async () => {
    await setToken(loc1, 'tga_correcto')
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await revokeToken(req(loc1._id.toString(), 'DELETE'), tokenParams(loc1._id.toString()))
    expect(res.status).toBe(200)
    expect((await poll(loc1._id.toString())).status).toBe(200)
  })

  it('admin scoped a la sede A no genera token de la sede B → 404', async () => {
    setSessionUser({ id: 'u2', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const res = await generateToken(req(loc2._id.toString(), 'POST'), tokenParams(loc2._id.toString()))
    expect(res.status).toBe(404)
  })

  it('staff (no admin) no puede generar token → 403', async () => {
    setSessionUser({ id: 'u3', role: 'staff', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await generateToken(req(loc1._id.toString(), 'POST'), tokenParams(loc1._id.toString()))
    expect(res.status).toBe(403)
  })

  it('usuario de otro tenant → 403', async () => {
    setSessionUser({ id: 'u4', role: 'admin', tenantId: '507f1f77bcf86cd799439011', assignedLocations: [] })
    const res = await generateToken(req(loc1._id.toString(), 'POST'), tokenParams(loc1._id.toString()))
    expect(res.status).toBe(403)
  })
})
