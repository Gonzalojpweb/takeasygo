// ============================================================================
// print-job-lifecycle.test.ts — Orden de ejecución 31/10 (P0.2)
// ============================================================================
// El agente de impresión no debe imprimir dos veces el mismo trabajo por
// polls repetidos, confirmaciones perdidas o reconexiones; un resultado
// incierto no se reimprime solo; las reimpresiones quedan identificadas.
// Se prueba la lógica real (lib/printing/job-lifecycle) y la ruta del agente.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import Order from '@/models/Order'
import {
  CLAIM_TTL_MS,
  PRINTING_TTL_MS,
  claimOrderPrintJob,
  claimPreCloseJobs,
  completePreCloseJob,
  startPreCloseJob,
} from '@/lib/printing/job-lifecycle'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { GET as POLL, POST as REPORT } from '@/app/api/[tenant]/print-jobs/route'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
// La recuperación fiscal que dispara el poll no es parte de esta prueba.
vi.mock('@/lib/fiscal/issue', () => ({ kickFiscalRecovery: vi.fn().mockResolvedValue(false) }))

const SLUG = 'print-tenant'
let tenantId: mongoose.Types.ObjectId
let locationId: mongoose.Types.ObjectId

async function job(overrides: Record<string, unknown> = {}) {
  return PreClosePrintJob.create({
    tenantId,
    locationId,
    printerName: 'Caja',
    connectionType: 'tcp',
    ip: '10.0.0.9',
    port: 9100,
    paperWidth: 80,
    data: Buffer.from('ticket').toString('base64'),
    kind: 'other',
    ...overrides,
  })
}

async function authorizedDoc() {
  const orderId = new mongoose.Types.ObjectId()
  return FiscalDocument.create({
    tenantId, locationId, orderId, kind: 'invoice', letter: 'B', cbteTipo: 6, pointOfSale: 3,
    environment: 'homologation', issuerCuit: '20123456786', status: 'authorized', number: 12,
    cae: '75000000000001', caeExpiresAt: new Date('2026-11-09'), issuedAt: new Date(),
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
    amounts: { totalCents: 121_000, netCents: 100_000, ivaCents: 21_000, exemptCents: 0 },
    ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 100_000, amountCents: 21_000 }],
    lines: [{ description: 'Pizza', quantity: 1, totalCents: 121_000, ivaRate: 21 }],
    idempotencyKey: `invoice:${orderId}`, createdBy: 'test',
  })
}

const pollReq = () =>
  new NextRequest(`http://localhost/api/${SLUG}/print-jobs?locationId=${locationId}`, { headers: { 'x-agent-version': '2.1.0' } })
const postReq = (body: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/print-jobs`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const P = { params: Promise.resolve({ tenant: SLUG }) }

beforeEach(async () => {
  const tenant = await Tenant.create({ slug: SLUG, name: 'Impresión', isActive: true, status: 'active', plan: 'full' })
  tenantId = tenant._id
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id
  await Printer.create({ tenantId, locationId, uid: 'caja', name: 'Caja', ip: '10.0.0.9', roles: ['cashier'], paperWidth: 80 })
  await FiscalProfile.create({
    tenantId, enabled: true, cuit: '20123456786', legalName: 'Impresión SAS', ivaCondition: 'responsable_inscripto',
    fiscalAddress: 'Calle 1', environment: 'homologation', pointsOfSale: [{ locationId, number: 3 }],
  })
})

describe('Reserva atómica', () => {
  it('dos polls concurrentes nunca toman el mismo trabajo', async () => {
    for (let i = 0; i < 5; i++) await job()
    const [a, b] = await Promise.all([claimPreCloseJobs(tenantId, locationId, '2.1.0'), claimPreCloseJobs(tenantId, locationId, '2.1.0')])
    const ids = [...a, ...b].map((j) => String(j._id))
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
  })

  it('un trabajo reservado no se vuelve a entregar en el poll siguiente', async () => {
    await job()
    expect(await claimPreCloseJobs(tenantId, locationId, '2.1.0')).toHaveLength(1)
    expect(await claimPreCloseJobs(tenantId, locationId, '2.1.0')).toHaveLength(0)
  })

  it('una comanda de orden se reserva una sola vez', async () => {
    const order = await Order.collection.insertOne({
      tenantId, locationId,
      printJobs: [{ _id: new mongoose.Types.ObjectId(), printerId: new mongoose.Types.ObjectId(), printerName: 'Cocina', role: 'kitchen', payload: 'eA==', status: 'pending', attempts: 0 }],
    })
    const o = await Order.collection.findOne({ _id: order.insertedId })
    const pj = (o!.printJobs as { _id: mongoose.Types.ObjectId }[])[0]._id
    const [c1, c2] = await Promise.all([claimOrderPrintJob(order.insertedId as never, pj), claimOrderPrintJob(order.insertedId as never, pj)])
    expect([c1, c2].filter(Boolean)).toHaveLength(1)
  })
})

describe('Inicio, resultado y confirmaciones tardías', () => {
  it('sin confirmar el inicio con SU reserva, el agente no debe imprimir', async () => {
    await job()
    const [claimed] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    expect(await startPreCloseJob(String(claimed._id), 'otra-reserva')).toBe(false)
    expect(await startPreCloseJob(String(claimed._id), claimed.claimId!)).toBe(true)
    // Un segundo «start» del mismo trabajo tampoco pasa (ya está imprimiendo).
    expect(await startPreCloseJob(String(claimed._id), claimed.claimId!)).toBe(false)
  })

  it('impreso con confirmación: no se reimprime al reconectarse el agente', async () => {
    await job()
    const [claimed] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(claimed._id), claimed.claimId!)
    const done = await completePreCloseJob(String(claimed._id), { claimId: claimed.claimId, success: true, outcome: 'delivered_to_device' })
    expect(done).toMatchObject({ status: 'success', outcome: 'delivered_to_device' })
    expect(await claimPreCloseJobs(tenantId, locationId, '2.1.0')).toHaveLength(0)
  })

  it('una confirmación de otra reserva se ignora y no toca el estado', async () => {
    await job()
    const [claimed] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(claimed._id), claimed.claimId!)
    expect(await completePreCloseJob(String(claimed._id), { claimId: 'vieja', success: false, safeToRetry: true })).toBeNull()
    expect((await PreClosePrintJob.findById(claimed._id))?.status).toBe('printing')
  })

  it('una confirmación tardía de un trabajo no altera otro trabajo', async () => {
    const j1 = await job()
    const j2 = await job()
    const claimed = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    const c1 = claimed.find((c) => String(c._id) === String(j1._id))!
    await startPreCloseJob(String(j1._id), c1.claimId!)
    // El claimId de j1 usado contra j2: ignorado.
    expect(await completePreCloseJob(String(j2._id), { claimId: c1.claimId, success: true })).toBeNull()
    expect((await PreClosePrintJob.findById(j2._id))?.status).toBe('claimed')
  })
})

describe('Fallas y recuperación', () => {
  it('falla SEGURA (nada llegó a la impresora): vuelve a pendiente con espera y, agotada, queda en error', async () => {
    await job({ maxAttempts: 2 })
    let [c] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(c._id), c.claimId!)
    const first = await completePreCloseJob(String(c._id), { claimId: c.claimId, success: false, safeToRetry: true, errorMsg: 'Conexión rechazada' })
    expect(first).toMatchObject({ status: 'pending', attempts: 1 })
    expect(first!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now())
    // Durante la espera no se entrega.
    expect(await claimPreCloseJobs(tenantId, locationId, '2.1.0')).toHaveLength(0)
    await PreClosePrintJob.updateOne({ _id: c._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1) } })
    ;[c] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(c._id), c.claimId!)
    const last = await completePreCloseJob(String(c._id), { claimId: c.claimId, success: false, safeToRetry: true, errorMsg: 'Conexión rechazada' })
    expect(last).toMatchObject({ status: 'error', attempts: 2 })
  })

  it('falla a mitad de envío: queda DESCONOCIDO y no se reimprime solo', async () => {
    await job()
    const [c] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(c._id), c.claimId!)
    const out = await completePreCloseJob(String(c._id), { claimId: c.claimId, success: false, safeToRetry: false, errorMsg: 'Conexión cortada' })
    expect(out?.status).toBe('unknown')
    expect(await claimPreCloseJobs(tenantId, locationId, '2.1.0')).toHaveLength(0)
    // El resultado tardío del MISMO intento sí se acepta (el agente reconectó).
    expect(await completePreCloseJob(String(c._id), { claimId: c.claimId, success: true, outcome: 'delivered_to_device' })).toMatchObject({ status: 'success' })
  })

  it('el agente se cae sin confirmar el inicio: la reserva vence y el trabajo vuelve (no queda bloqueado)', async () => {
    await job()
    const [c] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await PreClosePrintJob.updateOne({ _id: c._id }, { $set: { claimExpiresAt: new Date(Date.now() - CLAIM_TTL_MS) } })
    const again = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    expect(again).toHaveLength(1)
    expect(again[0].claimId).not.toBe(c.claimId)
  })

  it('el agente se cae imprimiendo: pasa a desconocido (no a pendiente)', async () => {
    await job()
    const [c] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(c._id), c.claimId!)
    await PreClosePrintJob.updateOne({ _id: c._id }, { $set: { startedAt: new Date(Date.now() - PRINTING_TTL_MS - 1000) } })
    expect(await claimPreCloseJobs(tenantId, locationId, '2.1.0')).toHaveLength(0)
    expect((await PreClosePrintJob.findById(c._id))?.status).toBe('unknown')
  })
})

describe('Ticket fiscal: original único, reimpresión auditada, estados separados', () => {
  it('pedir el original dos veces a la vez genera UN solo trabajo', async () => {
    const doc = await authorizedDoc()
    const [a, b] = await Promise.all([enqueueFiscalTicket(doc), enqueueFiscalTicket(doc)])
    expect(a.ok && b.ok).toBe(true)
    expect(await PreClosePrintJob.countDocuments({ fiscalDocumentId: doc._id })).toBe(1)
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1)
  })

  it('la reimpresión queda identificada, numerada y no se superpone con otra en curso', async () => {
    const doc = await authorizedDoc()
    await enqueueFiscalTicket(doc)
    const busy = await enqueueFiscalTicket(doc, { reprint: true, requestedBy: 'u1' })
    expect(busy).toMatchObject({ ok: false, reason: 'in_progress' })
    await PreClosePrintJob.updateMany({ fiscalDocumentId: doc._id }, { $set: { status: 'success' } })
    const r = await enqueueFiscalTicket(doc, { reprint: true, requestedBy: 'u1' })
    expect(r).toMatchObject({ ok: true, reprint: 1 })
    const reprintJob = await PreClosePrintJob.findById(r.jobId).lean()
    expect(reprintJob).toMatchObject({ isReprint: true, requestedBy: 'u1', kind: 'fiscal_invoice' })
    expect(Buffer.from(reprintJob!.data, 'base64').toString('latin1')).toContain('REIMPRESION N. 1')
  })

  it('un comprobante NO autorizado nunca se imprime', async () => {
    const doc = await authorizedDoc()
    doc.status = 'retrying'
    expect(await enqueueFiscalTicket(doc)).toMatchObject({ ok: false, reason: 'not_authorized' })
  })

  it('el estado de impresión sigue al trabajo y NO cambia el estado fiscal', async () => {
    const doc = await authorizedDoc()
    await enqueueFiscalTicket(doc)
    const [c] = await claimPreCloseJobs(tenantId, locationId, '2.1.0')
    await startPreCloseJob(String(c._id), c.claimId!)
    await completePreCloseJob(String(c._id), { claimId: c.claimId, success: false, safeToRetry: false, errorMsg: 'Corte' })
    const after = await FiscalDocument.findById(doc._id).lean()
    expect(after?.status).toBe('authorized')
    expect(after?.printing.status).toBe('unknown')
    expect(after?.cae).toBe('75000000000001')
  })
})

describe('Ruta del agente', () => {
  it('poll repetido: el trabajo sale una sola vez; start con otra reserva ⇒ 409', async () => {
    await job()
    const first = await (await POLL(pollReq(), P)).json()
    expect(first.preCloseJobs).toHaveLength(1)
    const second = await (await POLL(pollReq(), P)).json()
    expect(second.preCloseJobs).toHaveLength(0)

    const j = first.preCloseJobs[0]
    expect((await REPORT(postReq({ preCloseJobId: j._id, claimId: 'otra', event: 'start' }), P)).status).toBe(409)
    expect((await REPORT(postReq({ preCloseJobId: j._id, claimId: j.claimId, event: 'start' }), P)).status).toBe(200)
    const res = await REPORT(postReq({ preCloseJobId: j._id, claimId: j.claimId, success: true, outcome: 'accepted_by_spooler', printerName: 'Caja' }), P)
    expect(res.status).toBe(200)
    expect((await PreClosePrintJob.findById(j._id))?.status).toBe('success')
  })
})
