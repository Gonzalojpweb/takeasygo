import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import CashRegister from '@/models/CashRegister'
import Printer from '@/models/Printer'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { signJwt } from '@takeasygo/business/jwt'
import { posPinLookup } from '@takeasygo/business/pos-pin'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { generateKeyAndCsr } from '@/lib/fiscal/arca/crypto'
import { retryPendingDocuments } from '@/lib/fiscal/issue'
import { fakeArcaCertificate, soapResponse } from '../fixtures/arca'
import type { NextRequest } from 'next/server'

import { POST as CREATE } from '@/app/api/[tenant]/pos/orders/route'
import { POST as PAY } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { POST as INVOICE } from '@/app/api/[tenant]/pos/orders/[id]/invoice/route'
import { POST as VOID } from '@/app/api/[tenant]/pos/orders/[id]/void/route'
import { GET as FISCAL_CONFIG } from '@/app/api/[tenant]/pos/fiscal/route'
import { GET as DOCUMENTS } from '@/app/api/[tenant]/admin/fiscal/documents/route'
import { NextRequest as NReq } from 'next/server'
import { POST as OPEN } from '@/app/api/[tenant]/pos/cash/registers/route'
import { POST as CLOSE } from '@/app/api/[tenant]/pos/cash/registers/[id]/close/route'

/**
 * Fase 5 — emisión de comprobantes contra un ARCA simulado.
 * Docs: ADMIN/FASE5_COMPROBANTES_NC_LIBRO_IVA.md
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'factura-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
const CUIT = '20123456786'
const PRODUCT_ID = '64b0000000000000000000aa'
const PIN = '482913'

let tenantId: string
let locationId: string

// ── ARCA simulado ───────────────────────────────────────────────────────────
type Mode = 'ok' | 'lost-response' | 'down' | 'reject'
const arca = {
  mode: 'ok' as Mode,
  last: new Map<string, number>(),
  authorized: new Map<string, { cae: string; total: string }>(),
  caeRequests: 0,
}

function tag(xml: string, name: string): string {
  return new RegExp(`<ar:${name}>([^<]*)</ar:${name}>`).exec(xml)?.[1] ?? ''
}

const arcaFetch = vi.fn(async (_url: string, init?: RequestInit) => {
  const body = String(init?.body ?? '')
  const key = `${tag(body, 'PtoVta')}-${tag(body, 'CbteTipo')}`
  if (arca.mode === 'down') throw new Error('ECONNREFUSED')
  if (body.includes('FECompUltimoAutorizado')) {
    return soapResponse(`<FECompUltimoAutorizadoResult><CbteNro>${arca.last.get(key) ?? 0}</CbteNro></FECompUltimoAutorizadoResult>`)
  }
  if (body.includes('FECompConsultar')) {
    const found = arca.authorized.get(`${key}-${tag(body, 'CbteNro')}`)
    return found
      ? soapResponse(`<ResultGet><ImpTotal>${found.total}</ImpTotal><CodAutorizacion>${found.cae}</CodAutorizacion><FchVto>20261102</FchVto><Resultado>A</Resultado></ResultGet>`)
      : soapResponse('<Errors><Err><Code>602</Code><Msg>Sin resultados</Msg></Err></Errors>')
  }
  if (body.includes('FECAESolicitar')) {
    arca.caeRequests++
    const number = Number(tag(body, 'CbteDesde'))
    if (arca.mode === 'reject') {
      return soapResponse(`<FECAEDetResponse><Resultado>R</Resultado><CbteDesde>${number}</CbteDesde><Observaciones><Obs><Code>10015</Code><Msg>El DocNro no es valido</Msg></Obs></Observaciones></FECAEDetResponse>`)
    }
    const cae = String(70000000000000 + arca.caeRequests)
    arca.last.set(key, number)
    arca.authorized.set(`${key}-${number}`, { cae, total: tag(body, 'ImpTotal') })
    if (arca.mode === 'lost-response') throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    return soapResponse(`<FECAEDetResponse><Resultado>A</Resultado><CbteDesde>${number}</CbteDesde><CAE>${cae}</CAE><CAEFchVto>20261102</CAEFchVto></FECAEDetResponse>`)
  }
  throw new Error(`llamada inesperada a ARCA: ${body.slice(0, 80)}`)
})

function token(role: 'cashier' | 'manager' = 'cashier'): string {
  return signJwt({ sub: '64b0000000000000000000c1', tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
}

function req(url: string, body: unknown, opts: { role?: 'cashier' | 'manager'; pin?: string; method?: string } = {}): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token(opts.role)}`,
    'x-location-id': locationId,
  }
  if (opts.pin) headers['x-manager-pin'] = opts.pin
  return new Request(url, { method: opts.method ?? 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest
}
const tp = () => ({ params: Promise.resolve({ tenant: SLUG }) })
const ip = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

async function paidOrder(quantity = 2): Promise<string> {
  const id = crypto.randomUUID()
  const created = await CREATE(
    req(`${BASE}/orders`, { id, items: [{ productId: PRODUCT_ID, name: 'Pizza', quantity, unitPrice: 605_000, total: 605_000 * quantity }] }),
    tp()
  )
  expect(created.status).toBe(201)
  const paid = await PAY(req(`${BASE}/orders/${id}/payments`, { payments: [{ id: crypto.randomUUID(), method: 'cash', amount: 605_000 * quantity }] }), ip(id))
  expect(paid.status).toBe(201)
  return id
}

function invoice(orderId: string, receiver?: unknown) {
  return INVOICE(req(`${BASE}/orders/${orderId}/invoice`, receiver ? { receiver } : {}), ip(orderId))
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
  process.env.POS_PIN_PEPPER = 'pepper-de-test-de-al-menos-16'
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  vi.stubGlobal('fetch', arcaFetch)
  arca.mode = 'ok'
  arca.last.clear()
  arca.authorized.clear()
  arca.caeRequests = 0
  arcaFetch.mockClear()
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

  const tenant = await Tenant.create({ name: 'Factura', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    categories: [{ name: 'Pizzas', sortOrder: 0, items: [{ _id: PRODUCT_ID, name: 'Pizza', price: 605_000 }] }],
  })
  await Printer.create({ tenantId, locationId, uid: 'caja', name: 'Caja', ip: '10.0.0.9', roles: ['cashier'], paperWidth: 80 })

  const creds = generateKeyAndCsr({ cuit: CUIT, legalName: 'Factura SAS' })
  await FiscalProfile.create({
    tenantId,
    enabled: true,
    cuit: CUIT,
    legalName: 'Factura SAS',
    ivaCondition: 'responsable_inscripto',
    fiscalAddress: 'Calle 1',
    environment: 'homologation',
    pointsOfSale: [{ locationId, number: 3 }],
    credentials: {
      certificate: encrypt(fakeArcaCertificate(creds.csrPem, creds.privateKeyPem, CUIT)),
      privateKey: encrypt(creds.privateKeyPem),
    },
    connection: { ok: true, environment: 'homologation', checkedAt: new Date(), message: 'ok' },
    // Ticket de ARCA ya vigente: estos tests no pasan por WSAA.
    wsaa: { environment: 'homologation', token: encrypt('T'), sign: encrypt('S'), expiresAt: new Date(Date.now() + 3600_000) },
  })
  await User.create({
    name: 'Encargada',
    email: `enc-${Math.random().toString(36).slice(2)}@t.test`,
    password: 'x'.repeat(20),
    phone: `+54911${Math.floor(Math.random() * 1e8)}`,
    role: 'manager',
    tenantId,
    isActive: true,
    pin: await bcrypt.hash(PIN, 4),
    posPinLookup: posPinLookup(process.env.POS_PIN_PEPPER!, tenantId, PIN),
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('factura desde el POS', () => {
  it('el POS sabe cómo facturar esta sede', async () => {
    const res = await FISCAL_CONFIG(req(`${BASE}/fiscal`, undefined, { method: 'GET' }), tp())
    expect(await res.json()).toMatchObject({ enabled: true, mode: 'ask', letterForFinalConsumer: 'B', letterForCompany: 'A' })
  })

  it('Factura B a consumidor final: número último+1, CAE, QR, IVA e impresión', async () => {
    arca.last.set('3-6', 41)
    const orderId = await paidOrder()
    const res = await invoice(orderId)
    expect(res.status).toBe(201)
    const { document, printed } = await res.json()
    expect(document).toMatchObject({ status: 'authorized', letter: 'B', number: 42, label: 'Factura B 00003-00000042' })
    expect(printed).toMatchObject({ ok: true, printerName: 'Caja' })

    const saved = await FiscalDocument.findOne({ tenantId }).lean()
    expect(saved?.amounts).toEqual({ totalCents: 1_210_000, netCents: 1_000_000, ivaCents: 210_000, exemptCents: 0 })
    expect(saved?.qrUrl).toContain('https://www.afip.gob.ar/fe/qr/?p=')
    expect(await PreClosePrintJob.countDocuments({ tenantId })).toBe(1)

    // Reintento del POS: misma factura, ningún CAE nuevo.
    const again = await invoice(orderId)
    expect((await again.json()).document.number).toBe(42)
    expect(arca.caeRequests).toBe(1)
  })

  it('Factura A a una empresa con CUIT', async () => {
    const orderId = await paidOrder(1)
    const res = await invoice(orderId, { condition: 'responsable_inscripto', docNumber: '20-12345678-6', name: 'Empresa SA' })
    const { document } = await res.json()
    expect(document).toMatchObject({ letter: 'A', status: 'authorized' })
    const sent = arcaFetch.mock.calls.map(([, i]) => String((i as RequestInit).body)).find((b) => b.includes('FECAESolicitar'))!
    expect(sent).toContain('<ar:DocTipo>80</ar:DocTipo><ar:DocNro>20123456786</ar:DocNro>')
    expect(sent).toContain('<ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>')
  })

  it('una orden sin cobrar no se factura', async () => {
    const id = crypto.randomUUID()
    await CREATE(req(`${BASE}/orders`, { id, items: [{ productId: PRODUCT_ID, name: 'Pizza', quantity: 1, unitPrice: 605_000, total: 605_000 }] }), tp())
    expect((await invoice(id)).status).toBe(409)
  })

  it('ARCA autorizó pero la respuesta se perdió: el reintento lo recupera sin duplicar', async () => {
    const orderId = await paidOrder()
    arca.mode = 'lost-response'
    const res = await invoice(orderId)
    expect(res.status).toBe(202)
    const pending = await FiscalDocument.findOne({ tenantId }).lean()
    expect(pending).toMatchObject({ status: 'retrying', reservedNumber: 1, number: null })

    arca.mode = 'ok'
    await FiscalDocument.updateOne({ _id: pending!._id }, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } }, { timestamps: false })
    const result = await retryPendingDocuments({ tenantId })
    expect(result).toEqual({ tried: 1, authorized: 1 })
    const done = await FiscalDocument.findById(pending!._id).lean()
    expect(done).toMatchObject({ status: 'authorized', number: 1 })
    expect(arca.caeRequests).toBe(1) // se consultó, no se pidió otro CAE
  })

  it('ARCA caída: la venta sigue y la factura queda para reintentar', async () => {
    const orderId = await paidOrder()
    arca.mode = 'down'
    const res = await invoice(orderId)
    expect(res.status).toBe(202)
    expect((await res.json()).document.status).toBe('retrying')
  })

  it('rechazo de ARCA: queda rechazada con el motivo, sin consumir número', async () => {
    const orderId = await paidOrder()
    arca.mode = 'reject'
    const res = await invoice(orderId)
    expect(res.status).toBe(200)
    expect((await res.json()).document).toMatchObject({ status: 'rejected', message: 'El DocNro no es valido' })
    expect(arca.last.get('3-6') ?? 0).toBe(0)
  })
})

describe('anular una venta facturada', () => {
  it('emite la nota de crédito B asociada y el Z resume lo facturado', async () => {
    const opened = await OPEN(req(`${BASE}/cash/registers`, { id: crypto.randomUUID(), initialAmount: 0 }), tp())
    const register = (await opened.json()).register

    const orderId = await paidOrder()
    await invoice(orderId)
    const voided = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'complaint' }, { pin: PIN }), ip(orderId))
    expect(voided.status).toBe(200)
    const { creditNote } = await voided.json()
    expect(creditNote).toMatchObject({ kind: 'credit_note', letter: 'B', status: 'authorized', number: 1 })

    const nc = await FiscalDocument.findOne({ tenantId, kind: 'credit_note' }).lean()
    expect(nc).toMatchObject({ cbteTipo: 8, associated: { cbteTipo: 6, pointOfSale: 3, number: 1 } })
    const sent = arcaFetch.mock.calls.map(([, i]) => String((i as RequestInit).body)).filter((b) => b.includes('FECAESolicitar')).at(-1)!
    expect(sent).toContain('<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>6</ar:Tipo><ar:PtoVta>3</ar:PtoVta><ar:Nro>1</ar:Nro>')

    const closed = await CLOSE(req(`${BASE}/cash/registers/${register.id}/close`, { finalAmount: 0 }), ip(register.id))
    expect((await closed.json()).register.zReport.fiscal).toEqual({
      invoices: 1,
      invoicedCents: 1_210_000,
      creditNotes: 1,
      creditedCents: 1_210_000,
      pending: 0,
    })
    expect(await CashRegister.countDocuments({ tenantId, status: 'closed' })).toBe(1)
  })

  it('una venta sin factura se anula sin nota de crédito', async () => {
    await OPEN(req(`${BASE}/cash/registers`, { id: crypto.randomUUID(), initialAmount: 0 }), tp())
    const orderId = await paidOrder()
    const voided = await VOID(req(`${BASE}/orders/${orderId}/void`, { reason: 'other' }, { role: 'manager' }), ip(orderId))
    expect((await voided.json()).creditNote).toBeNull()
  })
})

describe('panel: comprobantes y Libro IVA', () => {
  it('lista el mes y descarga el CSV para el contador', async () => {
    const orderId = await paidOrder()
    await invoice(orderId)
    const admin = await User.create({
      name: 'Admin',
      email: `adm-${Math.random().toString(36).slice(2)}@t.test`,
      password: 'x'.repeat(20),
      phone: `+54911${Math.floor(Math.random() * 1e8)}`,
      role: 'admin',
      tenantId,
    })
    vi.mocked(auth).mockResolvedValue({ user: { id: String(admin._id), role: 'admin', tenantId, assignedLocations: [] }, expires: '' } as never)
    const month = new Date().toISOString().slice(0, 7)
    const P = { params: Promise.resolve({ tenant: SLUG }) }

    const list = await DOCUMENTS(new NReq(`http://localhost/api/${SLUG}/admin/fiscal/documents?month=${month}`), P)
    const body = await list.json()
    expect(body.environment).toBe('homologation')
    expect(body.totals).toMatchObject({ documents: 1, totalCents: 1_210_000, ivaCents: 210_000 })
    expect(body.documents[0]).toMatchObject({ label: 'Factura B 00003-00000001', status: 'authorized' })

    const csv = await DOCUMENTS(new NReq(`http://localhost/api/${SLUG}/admin/fiscal/documents?month=${month}&format=csv`), P)
    expect(csv.headers.get('content-disposition')).toContain('PRUEBAS')
    expect(await csv.text()).toContain('Factura B;006;00003;00000001')
  })
})
