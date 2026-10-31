// ============================================================================
// fiscal-integrity.test.ts — Orden de ejecución 31/10 (P0.1 y P1.1)
// ============================================================================
// P0.1: un comprobante se emite SOLO con su identidad fiscal (ambiente + CUIT
//       con que se creó). Si la configuración cambió, queda en revisión y NO
//       se llama a ARCA.
// P1.1: recuperar un número reservado exige que coincidan todos los datos del
//       comprobante, no solo el importe.
// ARCA simulado: registra cada llamada (URL y método SOAP) para verificar que
// en los casos bloqueados no sale ningún pedido.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument, { type IFiscalDocument } from '@/models/FiscalDocument'
import { encrypt } from '@/lib/crypto'
import { generateKeyAndCsr } from '@/lib/fiscal/arca/crypto'
import { authorizeDocument, retryPendingDocuments } from '@/lib/fiscal/issue'
import { getWsfeAuth } from '@/lib/fiscal/arca/wsaa'
import { fakeArcaCertificate, soapResponse } from '../fixtures/arca'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const CUIT = '20123456786'
const OTHER_CUIT = '30712345671'
const ISSUED = new Date('2026-10-30T15:00:00Z') // 20261030 en Argentina

let tenantId: mongoose.Types.ObjectId
let locationId: mongoose.Types.ObjectId
let privateKeyPem: string
let certificatePem: string

// ── ARCA simulado ───────────────────────────────────────────────────────────
const calls: { url: string; method: string }[] = []
let consult: Record<string, string> | null = null

function tag(xml: string, name: string): string {
  return new RegExp(`<ar:${name}>([^<]*)</ar:${name}>`).exec(xml)?.[1] ?? ''
}

const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
  const body = String(init.body ?? '')
  const method = /<ar:(\w+)>/.exec(body)?.[1] ?? (url.includes('LoginCms') ? 'LoginCms' : '?')
  calls.push({ url, method })
  if (url.includes('LoginCms')) {
    const exp = new Date(Date.now() + 12 * 3600_000).toISOString()
    const ticket = `<loginTicketResponse><credentials><token>NEW</token><sign>NEWS</sign></credentials><header><expirationTime>${exp}</expirationTime></header></loginTicketResponse>`
    return soapResponse(`<loginCmsReturn>${ticket.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loginCmsReturn>`)
  }
  if (method === 'FECompConsultar') {
    if (!consult) return soapResponse('<Errors><Err><Code>602</Code><Msg>Sin resultados</Msg></Err></Errors>')
    const f = consult
    return soapResponse(
      `<ResultGet><DocTipo>${f.DocTipo}</DocTipo><DocNro>${f.DocNro}</DocNro><CbteDesde>${f.CbteDesde}</CbteDesde><CbteFch>${f.CbteFch}</CbteFch>` +
        `<ImpTotal>${f.ImpTotal}</ImpTotal><ImpNeto>${f.ImpNeto}</ImpNeto><ImpIVA>${f.ImpIVA}</ImpIVA><Resultado>A</Resultado>` +
        `<CodAutorizacion>${f.CAE}</CodAutorizacion><FchVto>20261109</FchVto><PtoVta>${f.PtoVta}</PtoVta><CbteTipo>${f.CbteTipo}</CbteTipo></ResultGet>`
    )
  }
  if (method === 'FECompUltimoAutorizado') {
    return soapResponse(`<FECompUltimoAutorizadoResult><CbteNro>7</CbteNro></FECompUltimoAutorizadoResult>`)
  }
  if (method === 'FECAESolicitar') {
    const n = tag(body, 'CbteDesde')
    return soapResponse(`<FECAEDetResponse><Resultado>A</Resultado><CbteDesde>${n}</CbteDesde><CAE>75000000000001</CAE><CAEFchVto>20261109</CAEFchVto></FECAEDetResponse>`)
  }
  throw new Error(`llamada inesperada: ${method}`)
})

/** El comprobante 5 tal como lo informaría ARCA si fuera EL NUESTRO. */
function ours(): Record<string, string> {
  return {
    PtoVta: '3', CbteTipo: '6', CbteDesde: '5', CbteFch: '20261030', DocTipo: '99', DocNro: '0',
    ImpTotal: '1210.00', ImpNeto: '1000.00', ImpIVA: '210.00', CAE: '74000000000005',
  }
}

async function seedProfile(environment: 'homologation' | 'production', cuit = CUIT) {
  await FiscalProfile.deleteMany({ tenantId })
  await FiscalProfile.create({
    tenantId,
    enabled: true,
    cuit,
    legalName: 'Integridad SAS',
    ivaCondition: 'responsable_inscripto',
    fiscalAddress: 'Calle 1',
    environment,
    pointsOfSale: [{ locationId, number: 3 }],
    credentials: { certificate: encrypt(certificatePem), privateKey: encrypt(privateKeyPem) },
    wsaa: { environment, cuit, token: encrypt('T'), sign: encrypt('S'), expiresAt: new Date(Date.now() + 3600_000) },
  })
}

async function pendingDoc(overrides: Partial<Record<string, unknown>> = {}): Promise<IFiscalDocument> {
  const orderId = new mongoose.Types.ObjectId()
  return FiscalDocument.create({
    tenantId,
    locationId,
    orderId,
    kind: 'invoice',
    letter: 'B',
    cbteTipo: 6,
    pointOfSale: 3,
    environment: 'homologation',
    issuerCuit: CUIT,
    status: 'retrying',
    issuedAt: ISSUED,
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
    amounts: { totalCents: 121_000, netCents: 100_000, ivaCents: 21_000, exemptCents: 0 },
    ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 100_000, amountCents: 21_000 }],
    lines: [{ description: 'Pizza', quantity: 1, totalCents: 121_000, ivaRate: 21 }],
    idempotencyKey: `invoice:${orderId}`,
    createdBy: 'test',
    ...overrides,
  })
}

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
  tenantId = new mongoose.Types.ObjectId()
  locationId = new mongoose.Types.ObjectId()
  const creds = generateKeyAndCsr({ cuit: CUIT, legalName: 'Integridad SAS' })
  privateKeyPem = creds.privateKeyPem
  certificatePem = fakeArcaCertificate(creds.csrPem, creds.privateKeyPem, CUIT)
  calls.length = 0
  consult = null
  fetchImpl.mockClear()
})

describe('P0.1 — aislamiento entre homologación y producción', () => {
  it('un comprobante de homologación NO se emite en producción (el perfil cambió)', async () => {
    const doc = await pendingDoc({ environment: 'homologation' })
    await seedProfile('production')
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out.status).toBe('needs_review')
    expect(out.review.code).toBe('environment_mismatch')
    expect(out.environment).toBe('homologation')
    expect(out.cae).toBeNull()
    expect(calls).toHaveLength(0) // ni WSAA ni WSFE: ningún pedido salió
  })

  it('un comprobante de producción NO recibe un CAE de homologación', async () => {
    const doc = await pendingDoc({ environment: 'production' })
    await seedProfile('homologation')
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out.status).toBe('needs_review')
    expect(out.cae).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('una operación de un CUIT no se emite con el perfil de otro CUIT', async () => {
    const doc = await pendingDoc({ issuerCuit: CUIT })
    await seedProfile('homologation', OTHER_CUIT)
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out.status).toBe('needs_review')
    expect(out.review.code).toBe('cuit_mismatch')
    expect(calls).toHaveLength(0)
  })

  it('los reintentos automáticos conservan la identidad: el cambio de perfil no mueve el pendiente', async () => {
    const doc = await pendingDoc({ environment: 'homologation', updatedAt: new Date(Date.now() - 600_000) })
    await FiscalDocument.updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(Date.now() - 600_000) } }, { timestamps: false })
    await seedProfile('production')
    const r = await retryPendingDocuments({ tenantId: String(tenantId), fetchImpl })
    expect(r).toEqual({ tried: 1, authorized: 0 })
    const after = await FiscalDocument.findById(doc._id).lean()
    expect(after).toMatchObject({ status: 'needs_review', environment: 'homologation', issuerCuit: CUIT, cae: null })
    expect(calls).toHaveLength(0)
    // Un segundo barrido NO lo vuelve a tomar (needs_review no se reintenta solo).
    expect(await retryPendingDocuments({ tenantId: String(tenantId), fetchImpl })).toEqual({ tried: 0, authorized: 0 })
  })

  it('con la identidad correcta emite, y todas las llamadas van a los servidores de homologación', async () => {
    const doc = await pendingDoc()
    await seedProfile('homologation')
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out).toMatchObject({ status: 'authorized', number: 8, cae: '75000000000001' })
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.url.includes('homo'))).toBe(true)
  })

  it('un comprobante sin CUIT registrado no se emite', async () => {
    const doc = await pendingDoc({ issuerCuit: null })
    await seedProfile('homologation')
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out).toMatchObject({ status: 'needs_review' })
    expect(out.review.code).toBe('missing_identity')
    expect(calls).toHaveLength(0)
  })

  it('el ticket WSAA guardado para otro CUIT no se reutiliza', async () => {
    await seedProfile('homologation')
    await FiscalProfile.updateOne({ tenantId }, { $set: { 'wsaa.cuit': OTHER_CUIT } })
    const auth = await getWsfeAuth({ tenantId, environment: 'homologation', cuit: CUIT, certificatePem, privateKeyPem, fetchImpl })
    expect(auth.token).toBe('NEW')
    expect(calls.filter((c) => c.method === 'LoginCms')).toHaveLength(1)
    const stored = await FiscalProfile.findOne({ tenantId }).lean()
    expect(stored?.wsaa.cuit).toBe(CUIT)
  })
})

describe('P1.1 — recuperación de un número reservado: identidad completa', () => {
  const variants: [string, Partial<Record<string, string>>][] = [
    ['otro receptor', { DocTipo: '96', DocNro: '30111222' }],
    ['otra fecha', { CbteFch: '20261029' }],
    ['otro punto de venta', { PtoVta: '4' }],
    ['otro tipo de comprobante', { CbteTipo: '1' }],
    ['otro número', { CbteDesde: '6' }],
    ['otro neto/IVA con el mismo total', { ImpNeto: '1100.00', ImpIVA: '110.00' }],
  ]

  for (const [label, change] of variants) {
    it(`mismo importe pero ${label}: NO adopta el CAE y queda para revisión`, async () => {
      const doc = await pendingDoc({ reservedNumber: 5 })
      await seedProfile('homologation')
      consult = { ...ours(), ...change } as Record<string, string>
      const out = await authorizeDocument(doc, { fetchImpl })
      expect(out.status).toBe('needs_review')
      expect(out.review.code).toBe('arca_number_mismatch')
      expect(out.cae).toBeNull()
      expect(out.number).toBeNull()
      // No se pidió otro CAE a ciegas.
      expect(calls.some((c) => c.method === 'FECAESolicitar')).toBe(false)
    })
  }

  it('si todos los datos coinciden, adopta ese CAE sin pedir otro', async () => {
    const doc = await pendingDoc({ reservedNumber: 5 })
    await seedProfile('homologation')
    consult = ours()
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out).toMatchObject({ status: 'authorized', number: 5, cae: '74000000000005' })
    expect(calls.some((c) => c.method === 'FECAESolicitar')).toBe(false)
  })

  it('si otro comprobante del sistema ya tiene ese número, no lo duplica: revisión', async () => {
    await seedProfile('homologation')
    await pendingDoc({ status: 'authorized', number: 5, cae: '74000000000005' })
    const doc = await pendingDoc({ reservedNumber: 5 })
    consult = ours()
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out.status).toBe('needs_review')
    expect(out.review.code).toBe('number_taken_locally')
    expect(await FiscalDocument.countDocuments({ tenantId, number: 5 })).toBe(1)
  })

  it('si ARCA no tiene el número reservado, pide uno nuevo (el anterior nunca se autorizó)', async () => {
    const doc = await pendingDoc({ reservedNumber: 5 })
    await seedProfile('homologation')
    consult = null
    const out = await authorizeDocument(doc, { fetchImpl })
    expect(out).toMatchObject({ status: 'authorized', number: 8 })
  })
})

describe('P1.3 — reintentos con espera progresiva', () => {
  it('un error transitorio deja el comprobante en reintento con próxima fecha, sin perderlo', async () => {
    const doc = await pendingDoc({ status: 'pending' })
    await seedProfile('homologation')
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const out = await authorizeDocument(doc, { fetchImpl: down })
    expect(out.status).toBe('retrying')
    expect(out.arca.lastErrorKind).toBe('network')
    expect(out.arca.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now())
    // Antes de la próxima fecha, el barrido no lo toma.
    await FiscalDocument.updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(Date.now() - 600_000) } }, { timestamps: false })
    expect((await retryPendingDocuments({ tenantId: String(tenantId), fetchImpl })).tried).toBe(0)
    // Con «Reintentar» (ignorando la espera) sí.
    expect(await retryPendingDocuments({ tenantId: String(tenantId), fetchImpl, ignoreBackoff: true })).toEqual({ tried: 1, authorized: 1 })
  })
})
