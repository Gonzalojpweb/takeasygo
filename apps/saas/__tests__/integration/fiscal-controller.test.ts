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
  controllerAttention,
  creditNoteForControllerOrder,
  listControllerDocuments,
  resolveControllerJob,
  retryControllerJob,
  enqueueControllerInvoice,
  enqueueControllerReport,
  modalityFor,
  startControllerJob,
} from '@/lib/fiscal/controller'
import { prepareInvoiceForOrder } from '@/lib/fiscal/issue'
import { registerFiscalObligation } from '@/lib/fiscal/obligation'
import { autoInvoiceOnlineOrder, creditNoteForCancelledOrder } from '@/lib/fiscal/online'
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
    _id, tenantId, locationId, orderNumber: `T-${String(_id).slice(-6)}`, total: 121_000, status: 'delivered',
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

describe('Sede con impresora fiscal sin factura electrónica (02/11)', () => {
  it('sin certificado ni facturación activada, el cobro igual genera la operación para el equipo', async () => {
    await FiscalProfile.updateOne({ tenantId }, { $set: { enabled: false, invoicingMode: 'ask' } })
    const id = await paidOrder(ctrlLocation)
    const out = await registerFiscalObligation({ tenantId: String(tenantId), orderId: id, userId: 'u', userRole: 'cashier', intent: { receiver: CF } })
    expect(out).toBe('created')
    expect(await FiscalControllerJob.countDocuments({ tenantId, orderId: new mongoose.Types.ObjectId(id) })).toBe(1)
    // La sede electrónica, con la facturación apagada, no factura.
    const e = await paidOrder(eLocation)
    expect(await registerFiscalObligation({ tenantId: String(tenantId), orderId: e, userId: 'u', userRole: 'cashier', intent: { receiver: CF } })).toBe('skipped')
    expect(await FiscalDocument.countDocuments({ tenantId })).toBe(0)
  })

  it('con «no facturar» el controlador tampoco recibe nada', async () => {
    await FiscalProfile.updateOne({ tenantId }, { $set: { enabled: false, invoicingMode: 'off' } })
    const id = await paidOrder(ctrlLocation)
    expect(await registerFiscalObligation({ tenantId: String(tenantId), orderId: id, userId: 'u', userRole: 'cashier', intent: { receiver: CF } })).toBe('skipped')
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

describe('Informes X y Z', () => {
  const report = (kind: 'x' | 'z', requestId: string, locationId = ctrlLocation) =>
    enqueueControllerReport({ tenantId: String(tenantId), locationId: String(locationId), kind, requestId, userId: 'u' })

  it('reenviar el mismo pedido no crea otro Z', async () => {
    const a = await report('z', 'pedido-1')
    const b = await report('z', 'pedido-1')
    expect(String(a._id)).toBe(String(b._id))
    expect(a.operation).toBe('z_report')
    expect(a.orderId).toBeNull()
    expect(await FiscalControllerJob.countDocuments({ tenantId })).toBe(1)
  })

  it('no acepta un segundo informe con otro en curso', async () => {
    await report('z', 'pedido-1')
    await expect(report('x', 'pedido-2')).rejects.toThrow(/informe en curso/)
  })

  it('una sede sin impresora fiscal no pide informes', async () => {
    await expect(report('z', 'pedido-3', eLocation)).rejects.toThrow(/no tiene impresora fiscal/)
  })

  it('un Z que nadie tomó en 2 minutos se cancela: no se dispara cuando prenden el agente', async () => {
    const job = await report('z', 'pedido-4')
    await FiscalControllerJob.collection.updateOne({ _id: job._id }, { $set: { createdAt: new Date(Date.now() - 3 * 60_000) } })
    expect(await claimControllerJobs(tenantId, ctrlLocation, '2.3.0')).toHaveLength(0)
    expect((await FiscalControllerJob.findById(job._id))?.status).toBe('cancelled')
  })

  it('un pedido reciente sí se entrega y se confirma con el número del equipo', async () => {
    const job = await report('z', 'pedido-5')
    const [claimed] = await claimControllerJobs(tenantId, ctrlLocation, '2.3.0')
    expect(String(claimed._id)).toBe(String(job._id))
    await startControllerJob(String(job._id), claimed.claimId!)
    const out = await completeControllerJob(String(job._id), { claimId: claimed.claimId!, outcome: 'confirmed', result: { documentType: 'CIERRE Z', number: 1355 } })
    expect(out).toMatchObject({ status: 'confirmed', result: { number: 1355 } })
  })
})

describe('Comprobantes: vencimiento, nota de crédito, reintento y resolución', () => {
  async function emitted(number = 46280) {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    const [claimed] = await claimControllerJobs(tenantId, ctrlLocation, 'x')
    await startControllerJob(String(claimed._id), claimed.claimId!)
    await completeControllerJob(String(claimed._id), { claimId: claimed.claimId!, outcome: 'confirmed', result: { documentType: 'TIQUE', pointOfSale: 4, number } })
    return { orderId, jobId: String(job._id) }
  }

  it('un comprobante que nadie tomó en 15 minutos vence: no sale horas después', async () => {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    await FiscalControllerJob.updateOne({ _id: job._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await claimControllerJobs(tenantId, ctrlLocation, 'x')).toHaveLength(0)
    expect((await FiscalControllerJob.findById(job._id))!.status).toBe('expired')
  })

  it('uno creado antes de existir el vencimiento también vence, por su antigüedad', async () => {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    await FiscalControllerJob.collection.updateOne({ _id: job._id }, { $set: { expiresAt: null, createdAt: new Date(Date.now() - 3_600_000) } })
    expect(await claimControllerJobs(tenantId, ctrlLocation, 'x')).toHaveLength(0)
    expect((await FiscalControllerJob.findById(job._id))!.status).toBe('expired')
  })

  it('un vencido se reintenta a mano y vuelve a entregarse', async () => {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    await FiscalControllerJob.updateOne({ _id: job._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    await claimControllerJobs(tenantId, ctrlLocation, 'x')
    await retryControllerJob(String(tenantId), String(ctrlLocation), String(job._id))
    expect(await claimControllerJobs(tenantId, ctrlLocation, 'x')).toHaveLength(1)
  })

  it('un resultado desconocido o ya emitido NO se reintenta', async () => {
    const { jobId } = await emitted()
    await expect(retryControllerJob(String(tenantId), String(ctrlLocation), jobId)).rejects.toThrow(/no se emitió/)
    await FiscalControllerJob.updateOne({ _id: jobId }, { $set: { status: 'unknown' } })
    await expect(retryControllerJob(String(tenantId), String(ctrlLocation), jobId)).rejects.toThrow(/no se emitió/)
  })

  it('una venta anulada no reemite su comprobante', async () => {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    await FiscalControllerJob.updateOne({ _id: job._id }, { $set: { status: 'failed' } })
    await Order.updateOne({ _id: orderId }, { $set: { status: 'cancelled' } })
    await expect(retryControllerJob(String(tenantId), String(ctrlLocation), String(job._id))).rejects.toThrow(/anulada/)
  })

  it('anular una venta emitida crea UNA nota de crédito que apunta al comprobante', async () => {
    const { orderId } = await emitted(46281)
    const input = { tenantId: String(tenantId), orderId, userId: 'u' }
    const [a, b] = await Promise.all([creditNoteForControllerOrder(input), creditNoteForControllerOrder(input)])
    expect([a.kind, b.kind]).toEqual(['queued', 'queued'])
    const notes = await FiscalControllerJob.find({ tenantId, orderId, operation: 'credit_note' })
    expect(notes).toHaveLength(1)
    expect(notes[0].payload!.origin).toEqual({ documentType: 'TIQUE', pointOfSale: 4, number: 46281 })
  })

  it('anular antes de que salga lo frena: el agente ya no puede enviarlo', async () => {
    const orderId = await paidOrder(ctrlLocation)
    await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    const [claimed] = await claimControllerJobs(tenantId, ctrlLocation, 'x')
    expect((await creditNoteForControllerOrder({ tenantId: String(tenantId), orderId, userId: 'u' })).kind).toBe('stopped')
    expect(await startControllerJob(String(claimed._id), claimed.claimId!)).toBe(false)
    expect(await FiscalControllerJob.exists({ tenantId, orderId, operation: 'credit_note' })).toBeNull()
  })

  it('con el resultado incierto no decide, y una persona lo resuelve', async () => {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId, receiver: {}, userId: 'u' })
    await FiscalControllerJob.updateOne({ _id: job._id }, { $set: { status: 'unknown' } })
    const input = { tenantId: String(tenantId), orderId, userId: 'u' }
    await expect(creditNoteForControllerOrder(input)).rejects.toThrow(/desconocido/)
    const base = { tenantId: String(tenantId), locationId: String(ctrlLocation), id: String(job._id), userId: 'u' }
    await expect(resolveControllerJob({ ...base, emitted: true })).rejects.toThrow(/número/)
    const fixed = await resolveControllerJob({ ...base, emitted: true, number: 77 })
    expect([fixed.status, fixed.result.number, fixed.resolvedBy]).toEqual(['confirmed', 77, 'u'])
    expect((await creditNoteForControllerOrder(input)).kind).toBe('queued')
  })

  it('el domicilio del cliente viaja al equipo', async () => {
    const orderId = await paidOrder(ctrlLocation)
    const job = await enqueueControllerInvoice({
      tenantId: String(tenantId), orderId, userId: 'u',
      receiver: { condition: 'responsable_inscripto', docNumber: '30712345671', name: 'Empresa', address: 'Av. Siempre Viva 123' },
    })
    expect(job.payload!.receiver).toMatchObject({ docType: 80, address: 'Av. Siempre Viva 123' })
  })

  it('el listado y las alertas muestran lo que necesita a una persona', async () => {
    const { orderId } = await emitted(46282)
    await Order.updateOne({ _id: orderId }, { $set: { status: 'cancelled' } })
    const failedOrder = await paidOrder(ctrlLocation)
    const failed = await enqueueControllerInvoice({ tenantId: String(tenantId), orderId: failedOrder, receiver: {}, userId: 'u' })
    await FiscalControllerJob.updateOne({ _id: failed._id }, { $set: { status: 'failed', lastError: 'Sin papel' } })

    const attention = await controllerAttention(tenantId, { locationId: ctrlLocation })
    expect(attention).toEqual({ unknown: 0, notEmitted: 1, voidedWithoutCredit: 1 })

    const list = await listControllerDocuments(String(tenantId), String(ctrlLocation), {})
    expect(list.documents).toHaveLength(2)
    expect(list.counts).toMatchObject({ confirmed: 1, attention: 1 })
    expect(list.documents.find((d) => d.number === 46282)).toMatchObject({ orderCancelled: true, hasCreditNote: false })
  })
})

describe('Pedidos online en una sede con impresora fiscal', () => {
  async function onlineOrder(method: string, status = 'confirmed'): Promise<string> {
    const _id = new mongoose.Types.ObjectId()
    await Order.collection.insertOne({
      _id, tenantId, locationId: ctrlLocation, orderNumber: `W-${String(_id).slice(-6)}`, source: 'online', total: 121_000, status,
      items: [{ name: 'Pizza', quantity: 1, subtotal: 121_000 }],
      payment: { status: 'approved', method },
    })
    return String(_id)
  }
  const setting = (value: 'off' | 'auto') => FiscalProfile.updateOne({ tenantId }, { $set: { onlineInvoicing: value } })

  it('con la opción apagada (por defecto) no se emite nada', async () => {
    await setting('off')
    const id = await onlineOrder('mercadopago')
    await autoInvoiceOnlineOrder(id, 'paid')
    expect(await FiscalControllerJob.exists({ tenantId, orderId: id })).toBeNull()
  })

  it('con la opción activa sale al aprobarse el pago, sin necesitar ARCA, y la cancelación genera la NC', async () => {
    await setting('auto')
    await FiscalProfile.updateOne({ tenantId }, { $set: { enabled: false } })
    const id = await onlineOrder('mercadopago')
    await autoInvoiceOnlineOrder(id, 'paid')
    const job = await FiscalControllerJob.findOne({ tenantId, orderId: id, operation: 'invoice' })
    expect(job!.payload!.payments).toEqual([{ method: 'mercadopago', amountCents: 121_000 }])
    expect(await FiscalDocument.countDocuments({ tenantId, orderId: id })).toBe(0)

    await creditNoteForCancelledOrder(id)
    expect(await FiscalControllerJob.exists({ tenantId, orderId: id, operation: 'credit_note' })).toBeNull()
    await FiscalControllerJob.updateOne({ _id: job!._id }, { $set: { status: 'confirmed', 'result.number': 5, 'result.documentType': 'TIQUE' } })
    await creditNoteForCancelledOrder(id)
    expect(await FiscalControllerJob.countDocuments({ tenantId, orderId: id, operation: 'credit_note' })).toBe(1)
  })

  it('efectivo: recién al entregarse', async () => {
    await setting('auto')
    const id = await onlineOrder('cash')
    await autoInvoiceOnlineOrder(id, 'paid')
    expect(await FiscalControllerJob.exists({ tenantId, orderId: id })).toBeNull()
    await Order.updateOne({ _id: id }, { $set: { status: 'delivered' } })
    await autoInvoiceOnlineOrder(id, 'delivered')
    expect(await FiscalControllerJob.countDocuments({ tenantId, orderId: id })).toBe(1)
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
