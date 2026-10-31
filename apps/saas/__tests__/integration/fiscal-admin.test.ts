import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import mongoose from 'mongoose'
import { auth } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { fakeArcaCertificate, soapResponse } from '../fixtures/arca'

import { GET, PUT } from '@/app/api/[tenant]/admin/fiscal/route'
import { PUT as PUT_RATES } from '@/app/api/[tenant]/admin/fiscal/iva-rates/route'
import { POST as CSR } from '@/app/api/[tenant]/admin/fiscal/csr/route'
import { PUT as CERT } from '@/app/api/[tenant]/admin/fiscal/certificate/route'
import { POST as TEST } from '@/app/api/[tenant]/admin/fiscal/test/route'

/**
 * Fases 3 y 4 — panel de factura electrónica.
 * Docs: ADMIN/FASE3_DATOS_FISCALES_E_IVA.md · ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const SLUG = 'fiscal-tenant'
const CUIT = '20123456786'
const P = { params: Promise.resolve({ tenant: SLUG }) }
let tenantId: string
let locationId: string
let menuId: string
let categoryId: string
let itemId: string

function req(body?: unknown, method = 'PUT'): NextRequest {
  return new NextRequest(`http://localhost/api/${SLUG}/admin/fiscal`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function signIn(role: string) {
  const u = await User.create({
    name: role,
    email: `${role}-${Math.random().toString(36).slice(2, 7)}@t.test`,
    password: 'x'.repeat(20),
    phone: `+54911${Math.floor(Math.random() * 1e8)}`,
    role,
    tenantId,
  })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(u._id), role, tenantId, assignedLocations: [] }, expires: '' } as never)
}

function profileBody(overrides: Record<string, unknown> = {}) {
  return {
    cuit: '20-12345678-6',
    legalName: 'Keke SAS',
    ivaCondition: 'responsable_inscripto',
    grossIncomeNumber: '',
    activityStartDate: '2020-01-01',
    fiscalAddress: 'Av. Siempreviva 742, Córdoba',
    defaultIvaRate: 21,
    invoicingMode: 'ask',
    environment: 'homologation',
    pointsOfSale: [{ locationId, number: 3 }],
    enabled: false,
    ...overrides,
  }
}

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
})

beforeEach(async () => {
  const tenant = await Tenant.create({ name: 'Fiscal', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  const menu = await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    categories: [{ name: 'Bebidas', sortOrder: 0, items: [{ name: 'Agua', price: 100_000 }] }],
  })
  menuId = menu._id.toString()
  categoryId = String(menu.categories[0]._id)
  itemId = String(menu.categories[0].items[0]._id)
  await signIn('admin')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('datos fiscales (Fase 3)', () => {
  it('guarda, normaliza el CUIT y devuelve los pasos pendientes', async () => {
    const res = await PUT(req(profileBody()), P)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.cuit).toBe(CUIT)
    expect(body.readiness.ready).toBe(false)
    expect(body.readiness.steps.map((s: { step: string; ok: boolean }) => [s.step, s.ok])).toEqual([
      ['data', true],
      ['pointOfSale', true],
      ['certificate', false],
      ['connection', false],
    ])
  })

  it('un CUIT con dígito verificador inválido se rechaza', async () => {
    const res = await PUT(req(profileBody({ cuit: '20123456780' })), P)
    expect(res.status).toBe(400)
  })

  it('no se puede activar la facturación sin completar los pasos', async () => {
    const res = await PUT(req(profileBody({ enabled: true })), P)
    expect(res.status).toBe(409)
    expect(await FiscalProfile.countDocuments({ tenantId, enabled: true })).toBe(0)
  })

  it('un punto de venta de una sede ajena se rechaza', async () => {
    const res = await PUT(req(profileBody({ pointsOfSale: [{ locationId: '64b0000000000000000000ff', number: 3 }] })), P)
    expect(res.status).toBe(400)
  })

  // Orden de ejecución 31/10 (P0.1): la identidad fiscal no cambia con
  // comprobantes sin resolver; cada uno se emite con SU ambiente y CUIT.
  it('no deja pasar a producción (ni cambiar el CUIT) con comprobantes pendientes', async () => {
    expect((await PUT(req(profileBody()), P)).status).toBe(200)
    const orderId = new mongoose.Types.ObjectId()
    await FiscalDocument.create({
      tenantId, locationId, orderId, kind: 'invoice', letter: 'B', cbteTipo: 6, pointOfSale: 3,
      environment: 'homologation', issuerCuit: CUIT, status: 'retrying', issuedAt: new Date(),
      receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
      amounts: { totalCents: 1000, netCents: 826, ivaCents: 174, exemptCents: 0 },
      idempotencyKey: `invoice:${orderId}`, createdBy: 'test',
    })
    const toProd = await PUT(req(profileBody({ environment: 'production' })), P)
    expect(toProd.status).toBe(409)
    expect((await toProd.json()).unresolved).toBe(1)
    const otherCuit = await PUT(req(profileBody({ cuit: '30-71234567-1' })), P)
    expect(otherCuit.status).toBe(409)
    expect((await FiscalProfile.findOne({ tenantId }).lean())?.environment).toBe('homologation')

    // Resuelto el pendiente, el cambio pasa.
    await FiscalDocument.updateMany({ tenantId }, { $set: { status: 'rejected' } })
    expect((await PUT(req(profileBody({ environment: 'production' })), P)).status).toBe(200)
  })

  it('un cajero no puede tocar los datos fiscales', async () => {
    await signIn('cashier')
    const res = await PUT(req(profileBody()), P)
    expect(res.status).toBe(403)
  })

  it('el GET nunca devuelve secretos', async () => {
    await PUT(req(profileBody()), P)
    await CSR(req(undefined, 'POST'), P)
    const res = await GET(req(undefined, 'GET'), P)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('PRIVATE KEY')
    expect(text).toContain('CERTIFICATE REQUEST')
  })
})

describe('alícuotas de la carta (Fase 3)', () => {
  it('guarda la alícuota de una categoría y de un producto sin tocar precios', async () => {
    const res = await PUT_RATES(req({ menuId, categories: [{ id: categoryId, ivaRate: 10.5 }], items: [{ id: itemId, ivaRate: 21 }] }), P)
    expect(res.status).toBe(200)
    const menu = await Menu.findById(menuId).lean()
    expect(menu?.categories[0].ivaRate).toBe(10.5)
    expect(menu?.categories[0].items[0].ivaRate).toBe(21)
    expect(menu?.categories[0].items[0].price).toBe(100_000)
  })

  it('una alícuota inexistente se rechaza', async () => {
    const res = await PUT_RATES(req({ menuId, categories: [{ id: categoryId, ivaRate: 19 }], items: [] }), P)
    expect(res.status).toBe(400)
  })
})

describe('conexión con ARCA (Fase 4)', () => {
  async function uploadCertificate(): Promise<void> {
    await PUT(req(profileBody()), P)
    const csr = await (await CSR(req(undefined, 'POST'), P)).json()
    const stored = await FiscalProfile.findOne({ tenantId }).select('+credentials.pendingPrivateKey').lean()
    const pending = decrypt(stored!.credentials.pendingPrivateKey)
    const res = await CERT(req({ certificate: fakeArcaCertificate(csr.csr, pending, CUIT) }), P)
    expect(res.status).toBe(200)
  }

  it('el certificado tiene que corresponder al último pedido y al CUIT', async () => {
    await PUT(req(profileBody()), P)
    const csr = await (await CSR(req(undefined, 'POST'), P)).json()
    const stored = await FiscalProfile.findOne({ tenantId }).select('+credentials.pendingPrivateKey').lean()
    const pending = decrypt(stored!.credentials.pendingPrivateKey)

    const otherCuit = await CERT(req({ certificate: fakeArcaCertificate(csr.csr, pending, '27111111110') }), P)
    expect(otherCuit.status).toBe(400)

    const expired = await CERT(req({ certificate: fakeArcaCertificate(csr.csr, pending, CUIT, -1) }), P)
    expect(expired.status).toBe(400)

    const ok = await CERT(req({ certificate: fakeArcaCertificate(csr.csr, pending, CUIT) }), P)
    expect(ok.status).toBe(200)
    const saved = await FiscalProfile.findOne({ tenantId }).select('+credentials.certificate +credentials.privateKey +credentials.pendingPrivateKey').lean()
    expect(decrypt(saved!.credentials.certificate)).toContain('BEGIN CERTIFICATE')
    expect(decrypt(saved!.credentials.privateKey)).toBe(pending)
    expect(saved!.credentials.pendingPrivateKey).toBe('')
  })

  it('probar la conexión: autentica, consulta el punto de venta y habilita activar', async () => {
    await uploadCertificate()
    const ticket = '<loginTicketResponse><header><expirationTime>2099-01-01T00:00:00.000-03:00</expirationTime></header><credentials><token>T</token><sign>S</sign></credentials></loginTicketResponse>'
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? '')
      if (url.includes('LoginCms')) {
        return soapResponse(`<loginCmsResponse><loginCmsReturn>${ticket.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loginCmsReturn></loginCmsResponse>`)
      }
      if (body.includes('FEDummy')) return soapResponse('<FEDummyResponse><FEDummyResult><AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></FEDummyResult></FEDummyResponse>')
      return soapResponse('<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>3</PtoVta><CbteTipo>6</CbteTipo><CbteNro>0</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>')
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await TEST(req(undefined, 'POST'), P)
    expect(res.status).toBe(200)
    expect((await res.json()).message).toContain('PV 3, último 0')

    // El ticket queda guardado (cifrado) y se reutiliza: la segunda prueba no vuelve a autenticar.
    await TEST(req(undefined, 'POST'), P)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('LoginCms'))).toHaveLength(1)
    const stored = await FiscalProfile.findOne({ tenantId }).select('+wsaa.token').lean()
    expect(stored!.wsaa.token).not.toBe('T')
    expect(decrypt(stored!.wsaa.token)).toBe('T')

    const enable = await PUT(req(profileBody({ enabled: true })), P)
    expect(enable.status).toBe(200)
    expect((await enable.json()).readiness.ready).toBe(true)
  })

  it('si el certificado no está asociado al servicio, lo explica', async () => {
    await uploadCertificate()
    const ticket = '<loginTicketResponse><header><expirationTime>2099-01-01T00:00:00.000-03:00</expirationTime></header><credentials><token>T</token><sign>S</sign></credentials></loginTicketResponse>'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('LoginCms')) return soapResponse(`<loginCmsReturn>${ticket.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loginCmsReturn>`)
        if (String(init?.body).includes('FEDummy')) return soapResponse('<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>')
        return soapResponse('<Errors><Err><Code>601</Code><Msg>CUIT representada no incluida en Token</Msg></Err></Errors>')
      })
    )
    const res = await TEST(req(undefined, 'POST'), P)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('no está asociado al servicio')
    expect((await FiscalProfile.findOne({ tenantId }).lean())?.connection.ok).toBe(false)
  })
})
