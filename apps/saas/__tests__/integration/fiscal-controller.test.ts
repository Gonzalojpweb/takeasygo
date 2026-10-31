// ============================================================================
// fiscal-controller.test.ts — Orden de ejecución 31/10 (fase 3)
// ============================================================================
// Circuito de controlador fiscal homologado SIN driver de fabricante (no hay
// SDK ni manual a la fecha): modalidad excluyente con la factura electrónica,
// operación idempotente, ciclo de vida con reserva, y una desconexión a mitad
// de emisión nunca provoca una segunda emisión automática.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalControllerJob from '@/models/FiscalControllerJob'
import Order from '@/models/Order'
import {
  claimControllerJobs,
  completeControllerJob,
  enqueueControllerInvoice,
  modalityFor,
  startControllerJob,
} from '@/lib/fiscal/controller'
import { prepareInvoiceForOrder } from '@/lib/fiscal/issue'
import { GET as POLL, POST as REPORT } from '@/app/api/[tenant]/print-jobs/route'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: vi.fn() }))

const SLUG = 'ctrl-tenant'
let tenantId: mongoose.Types.ObjectId
let ctrlLocation: mongoose.Types.ObjectId
let eLocation: mongoose.Types.ObjectId

async function paidOrder(locationId: mongoose.Types.ObjectId): Promise<string> {
  const _id = new mongoose.Types.ObjectId()
  await Order.collection.insertOne({
    _id, tenantId, locationId, total: 121_000, status: 'delivered',
    items: [{ name: 'Pizza', quantity: 1, subtotal: 121_000 }],
    posPayments: [{ method: 'cash', amount: 121_000 }],
  })
  return String(_id)
}

const CF = { condition: 'consumidor_final' as const }
const P = { params: Promise.resolve({ tenant: SLUG }) }
const poll = (loc: mongoose.Types.ObjectId, capabilities = 'fiscal-controller') =>
  new NextRequest(`http://localhost/api/${SLUG}/print-jobs?locationId=${loc}`, { headers: { 'x-agent-version': '2.1.0', 'x-agent-capabilities': capabilities } })
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/print-jobs`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(async () => {
  tenantId = (await Tenant.create({ slug: SLUG, name: 'Controlador', isActive: true, status: 'active', plan: 'full' }))._id
  ctrlLocation = (await Location.create({ tenantId, name: 'Con equipo', slug: 'equipo', address: 'Calle 1', isActive: true }))._id
  eLocation = (await Location.create({ tenantId, name: 'Electrónica', slug: 'electronica', address: 'Calle 2', isActive: true }))._id
  await FiscalProfile.create({
    tenantId, enabled: true, cuit: '20123456786', legalName: 'Ctrl SAS', ivaCondition: 'responsable_inscripto',
    fiscalAddress: 'Calle 1', environment: 'homologation',
    pointsOfSale: [{ locationId: eLocation, number: 3 }, { locationId: ctrlLocation, number: 4 }],
    controllers: [{ locationId: ctrlLocation, brand: 'epson', model: 'sin confirmar', connection: 'usb', address: 'USB001', active: true }],
  })
})

describe('Modalidad fiscal explícita y excluyente', () => {
  it('una sede con controlador activo es «controller» aunque tenga punto de venta electrónico', async () => {
    const p = await FiscalProfile.findOne({ tenantId }).lean()
    expect(modalityFor(p as never, ctrlLocation)).toBe('controller')
    expect(modalityFor(p as never, eLocation)).toBe('electronic')
    expect(modalityFor(p as never, new mongoose.Types.ObjectId())).toBe('none')
  })

  it('en la sede con controlador NO se crea factura electrónica', async () => {
    const id = await paidOrder(ctrlLocation)
    await expect(prepareInvoiceForOrder({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })).rejects.toThrow(/controlador fiscal/)
    expect(await FiscalDocument.countDocuments({ tenantId })).toBe(0)
  })

  it('una venta con factura electrónica no se emite además en el controlador', async () => {
    const id = await paidOrder(ctrlLocation)
    await FiscalDocument.collection.insertOne({ tenantId, orderId: new mongoose.Types.ObjectId(id), kind: 'invoice', status: 'authorized', idempotencyKey: `invoice:${id}` })
    await expect(enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })).rejects.toThrow(/factura electrónica/)
  })

  it('en una sede electrónica no se encola nada al controlador', async () => {
    const id = await paidOrder(eLocation)
    await expect(enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })).rejects.toThrow(/no emite con controlador/)
  })
})

describe('Operación idempotente y ciclo de vida', () => {
  it('pedirla varias veces (también a la vez) deja UNA operación por venta', async () => {
    const id = await paidOrder(ctrlLocation)
    const [a, b] = await Promise.all([
      enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' }),
      enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' }),
    ])
    expect(String(a._id)).toBe(String(b._id))
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })
    expect(await FiscalControllerJob.countDocuments({ tenantId })).toBe(1)
    expect(a.device).toMatchObject({ brand: 'epson', connection: 'usb' })
    expect(a.payload?.totalCents).toBe(121_000)
  })

  it('confirmado SIN número del equipo no se acepta como emitido: queda desconocido', async () => {
    const id = await paidOrder(ctrlLocation)
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })
    const [job] = await claimControllerJobs(tenantId, ctrlLocation, '2.1.0')
    expect(await startControllerJob(String(job._id), 'otra')).toBe(false)
    expect(await startControllerJob(String(job._id), job.claimId!)).toBe(true)
    const out = await completeControllerJob(String(job._id), { claimId: job.claimId!, outcome: 'confirmed' })
    expect(out?.status).toBe('unknown')
  })

  it('confirmado con número: se persiste el resultado del equipo', async () => {
    const id = await paidOrder(ctrlLocation)
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })
    const [job] = await claimControllerJobs(tenantId, ctrlLocation, '2.1.0')
    await startControllerJob(String(job._id), job.claimId!)
    const out = await completeControllerJob(String(job._id), {
      claimId: job.claimId!, outcome: 'confirmed', result: { documentType: 'TIQUE FACTURA B', pointOfSale: 4, number: 120, totalCents: 121_000 },
    })
    expect(out).toMatchObject({ status: 'confirmed', result: { number: 120, pointOfSale: 4 } })
  })

  it('desconexión a mitad de la emisión: pasa a desconocido y NO se vuelve a entregar', async () => {
    const id = await paidOrder(ctrlLocation)
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })
    const [job] = await claimControllerJobs(tenantId, ctrlLocation, '2.1.0')
    await startControllerJob(String(job._id), job.claimId!)
    await FiscalControllerJob.updateOne({ _id: job._id }, { $set: { startedAt: new Date(Date.now() - 10 * 60_000) } })
    expect(await claimControllerJobs(tenantId, ctrlLocation, '2.1.0')).toHaveLength(0)
    expect((await FiscalControllerJob.findById(job._id))?.status).toBe('unknown')
  })

  it('el agente se cae antes de enviar: la reserva vence y la operación vuelve (no se pierde)', async () => {
    const id = await paidOrder(ctrlLocation)
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })
    const [job] = await claimControllerJobs(tenantId, ctrlLocation, '2.1.0')
    await FiscalControllerJob.updateOne({ _id: job._id }, { $set: { claimExpiresAt: new Date(Date.now() - 1000) } })
    expect(await claimControllerJobs(tenantId, ctrlLocation, '2.1.0')).toHaveLength(1)
  })
})

describe('Ruta del agente', () => {
  it('solo un agente con la capacidad recibe la operación; sin driver queda «driver_unavailable»', async () => {
    const id = await paidOrder(ctrlLocation)
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: id, receiver: CF, userId: 'u' })
    const legacy = await (await POLL(poll(ctrlLocation, ''), P)).json()
    expect(legacy.fiscalControllerJobs).toEqual([])

    const first = await (await POLL(poll(ctrlLocation), P)).json()
    expect(first.fiscalControllerJobs).toHaveLength(1)
    const j = first.fiscalControllerJobs[0]
    expect((await (await POLL(poll(ctrlLocation), P)).json()).fiscalControllerJobs).toHaveLength(0)

    const res = await REPORT(post({ fiscalControllerJobId: j._id, claimId: j.claimId, outcome: 'driver_unavailable', errorMsg: 'Driver Epson no implementado' }), P)
    expect(res.status).toBe(200)
    expect(await FiscalControllerJob.findById(j._id).lean()).toMatchObject({ status: 'driver_unavailable', lastError: 'Driver Epson no implementado' })
    // Un resultado con otra reserva se ignora.
    expect((await REPORT(post({ fiscalControllerJobId: j._id, claimId: 'otra', outcome: 'confirmed' }), P)).status).toBe(409)
  })
})
