import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import Order from '@/models/Order'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
  getSessionUser: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'admin', assignedLocations: [] }),
}))
vi.mock('@/lib/rbac', () => ({
  enforcePermissionForRequest: vi.fn().mockResolvedValue(null),
}))

import { POST as postPrinter } from '@/app/api/[tenant]/printers/route'
import { POST as postPrintJob } from '@/app/api/[tenant]/print-jobs/route'

/**
 * P-3: POST /printers rechaza sedes de otro tenant (404, sin crear).
 * P-2: print-jobs POST acota Printer.findOneAndUpdate por locationId —
 *      dos sedes con impresora del mismo nombre no se pisan el estado.
 */

const SLUG = 'printers-tenant'
const TENANT_B = '64b0000000000000000000b1'
const LOC_A = '64b0000000000000000000c1'
const LOC_B = '64b0000000000000000000c2'
const LOC_OTHER_TENANT = '64b0000000000000000000d1'

let tenant!: Awaited<ReturnType<typeof Tenant.create>>

function params(slug = SLUG) {
  return { params: Promise.resolve({ tenant: slug }) }
}

function printerReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/${SLUG}/printers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function printJobReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/${SLUG}/print-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  tenant = await Tenant.create({ slug: SLUG, name: 'Printers', isActive: true })
  await Tenant.create({ _id: TENANT_B, slug: 'other-tenant', name: 'Other', isActive: true })
  await Location.create({ _id: LOC_A, tenantId: tenant._id, name: 'Sede A', slug: 'sede-a', address: 'Av. Siempreviva 742', isActive: true })
  await Location.create({ _id: LOC_B, tenantId: tenant._id, name: 'Sede B', slug: 'sede-b', address: 'Av. Siempreviva 743', isActive: true })
  await Location.create({ _id: LOC_OTHER_TENANT, tenantId: TENANT_B, name: 'Ajena', slug: 'ajena', address: 'Av. Siempreviva 744', isActive: true })
})

describe('P-3: POST /printers — sede debe pertenecer al tenant', () => {
  it('404 y no crea si la sede es de otro tenant', async () => {
    const res = await postPrinter(
      printerReq({ locationId: LOC_OTHER_TENANT, name: 'Cocina', ip: '10.0.0.9' }),
      params()
    )
    expect(res.status).toBe(404)
    expect(await Printer.countDocuments({})).toBe(0)
  })

  it('201 si la sede pertenece al tenant', async () => {
    const res = await postPrinter(
      printerReq({ locationId: LOC_A, name: 'Cocina', ip: '10.0.0.5' }),
      params()
    )
    expect(res.status).toBe(201)
    const printer = await Printer.findOne({}).lean()
    expect(String(printer?.locationId)).toBe(LOC_A)
    expect(String(printer?.tenantId)).toBe(String(tenant._id))
  })
})

describe('P-2: print-jobs POST — estado de impresora acotado por sede', () => {
  beforeEach(async () => {
    // Misma name de impresora en DOS sedes del mismo tenant
    await Printer.create({ tenantId: tenant._id, locationId: LOC_A, uid: 'P1', name: 'Cocina', ip: '10.0.0.1', lastStatus: 'ok' })
    await Printer.create({ tenantId: tenant._id, locationId: LOC_B, uid: 'P2', name: 'Cocina', ip: '10.0.0.2', lastStatus: 'ok' })
  })

  it('reporte fallido en sede A no pisa lastStatus de sede B (formato viejo)', async () => {
    const order = await Order.create({
      tenantId: tenant._id,
      locationId: LOC_A,
      orderNumber: 'T-001',
      status: 'confirmed',
      orderMode: 'takeaway',
      printed: false,
      items: [],
      subtotal: 100,
      total: 100,
      customer: { name: 'Cliente', phone: '123' },
      payment: { method: 'cash', status: 'approved' },
    })

    const res = await postPrintJob(
      printJobReq({
        orderId: String(order._id),
        printerName: 'Cocina',
        role: 'kitchen',
        success: false,
        errorMsg: 'paper out',
      }),
      params()
    )
    expect(res.status).toBe(200)

    const a = await Printer.findOne({ locationId: LOC_A, name: 'Cocina' }).lean()
    const b = await Printer.findOne({ locationId: LOC_B, name: 'Cocina' }).lean()
    expect(a?.lastStatus).toBe('error')
    expect(b?.lastStatus).toBe('ok') // la otra sede queda intacta
  })
})
