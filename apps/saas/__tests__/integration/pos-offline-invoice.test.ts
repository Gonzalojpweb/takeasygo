import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Printer from '@/models/Printer'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalCounter from '@/models/FiscalCounter'
import CaeaPeriod from '@/models/CaeaPeriod'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import { signJwt } from '@takeasygo/business/jwt'
import { caeaPeriodOf } from '@takeasygo/business/escpos'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as createOrder } from '@/app/api/[tenant]/pos/orders/route'
import { POST as payOrder } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { GET as listDevices, PATCH as patchDevice } from '@/app/api/[tenant]/pos/offline/devices/route'

/**
 * POS offline V2 — etapa 5 (12/11/2026): factura sin internet con CAEA.
 *   · El equipo habilitado recibe su kit (CAEA, punto de venta exclusivo,
 *     último número, emisor, alícuotas).
 *   · Al volver la red, la factura que emitió viaja con el cobro y el server
 *     la guarda tal cual (pendiente de informar a ARCA). Lo que no cierra
 *     queda en revisión: el cliente ya tiene el papel.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'offline-invoice'
const PIZZA = '64b0000000000000000000c1'
const DEVICE = 'device-caja-0001'
const CUIT = '30712345674'

let tenantId: string
let locationId: string
let cajaId: string

function req(url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST'): NextRequest {
  const token = signJwt({ sub: '64b0000000000000000000a1', tenantId, role: 'admin', deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
}
const base = `http://localhost:3000/api/${SLUG}/pos`
const p = (id?: string) => ({ params: Promise.resolve(id ? { tenant: SLUG, id } : { tenant: SLUG }) }) as never
const offline = (extra: Record<string, string> = {}) => ({
  'x-pos-op-id': crypto.randomUUID(),
  'x-pos-occurred-at': new Date(Date.now() - 60_000).toISOString(),
  'x-pos-device-id': DEVICE,
  ...extra,
})

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  tenantId = (await Tenant.create({ name: 'Offline', slug: SLUG, plan: 'full' }))._id.toString()
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id.toString()
  await Menu.create({ tenantId, locationId, isActive: true, categories: [{ name: 'Cocina', sortOrder: 0, items: [{ _id: PIZZA, name: 'Pizza', price: 12100 }] }] })
  await FiscalProfile.create({
    tenantId,
    enabled: true,
    legalName: 'Comercio SA',
    cuit: CUIT,
    ivaCondition: 'responsable_inscripto',
    environment: 'homologation',
    defaultIvaRate: 21,
    pointsOfSale: [{ locationId, number: 3 }],
    contingency: { enabled: true, automatic: false, pointsOfSale: [{ locationId, number: 50 }] },
  })
  const { period, order } = caeaPeriodOf(new Date())
  await CaeaPeriod.create({ tenantId, environment: 'homologation', period, order, caea: '31234567890123', validFrom: new Date(Date.now() - 86_400_000), validTo: new Date(Date.now() + 5 * 86_400_000) })
  cajaId = String((await Printer.create({ tenantId, locationId, uid: 'caja', name: 'Caja', ip: '10.0.0.2', roles: ['cashier'], documents: ['factura', 'precuenta'] }))._id)
  await PosOfflineDevice.create({ tenantId, locationId, deviceId: DEVICE, name: 'Caja', role: 'primary' })
})

const devicesUrl = `${base}/offline/devices`
const kit = async () => (await (await listDevices(req(devicesUrl, undefined, { 'x-pos-device-id': DEVICE }, 'GET'), p())).json()).fiscal

describe('kit fiscal del equipo', () => {
  it('sin punto de venta propio no factura; con uno, recibe CAEA y último número', async () => {
    expect(await kit()).toMatchObject({ available: false, reason: expect.stringMatching(/punto de venta de contingencia/) })

    // No puede usar el de la factura online, ni el de la contingencia del server.
    expect((await patchDevice(req(devicesUrl, { deviceId: DEVICE, contingencyPointOfSale: 3 }, {}, 'PATCH'), p())).status).toBe(409)
    expect((await patchDevice(req(devicesUrl, { deviceId: DEVICE, contingencyPointOfSale: 50 }, {}, 'PATCH'), p())).status).toBe(409)
    expect((await patchDevice(req(devicesUrl, { deviceId: DEVICE, contingencyPointOfSale: 90 }, {}, 'PATCH'), p())).status).toBe(200)

    await FiscalCounter.create({ tenantId, environment: 'homologation', pointOfSale: 90, cbteTipo: 6, last: 5 })
    const k = await kit()
    expect(k).toMatchObject({ available: true, pointOfSale: 90, environment: 'homologation', issuer: { cuit: CUIT, legalName: 'Comercio SA', ivaCondition: 'responsable_inscripto' } })
    expect(k.lastNumbers['6']).toBe(5)
    expect(k.caeas[0].caea).toBe('31234567890123')
    expect(k.ivaRates[PIZZA]).toBe(21)

    // Otro equipo no puede tomar el mismo número.
    await PosOfflineDevice.create({ tenantId, locationId, deviceId: 'device-mozo-0002', name: 'Mozo', role: 'secondary' })
    expect((await patchDevice(req(devicesUrl, { deviceId: 'device-mozo-0002', contingencyPointOfSale: 90 }, {}, 'PATCH'), p())).status).toBe(409)
  })
})

async function paidOffline(invoice: Record<string, unknown>, printed?: string) {
  const posId = crypto.randomUUID()
  const create = await createOrder(req(`${base}/orders`, { id: posId, status: 'confirmed', items: [{ productId: PIZZA, name: 'Pizza', quantity: 1, unitPrice: 12100, total: 12100 }] }, offline()), p())
  expect(create.status).toBe(201)
  const pay = await payOrder(
    req(`${base}/orders/${posId}/payments`, { payments: [{ id: 'p1', method: 'cash', amount: 12100 }], invoice }, offline(printed ? { 'x-pos-printed': printed } : {})),
    p(posId)
  )
  expect(pay.status).toBe(201)
  return posId
}

const caeaInvoice = (overrides: Record<string, unknown> = {}) => ({
  receiver: { condition: 'consumidor_final', docNumber: '', name: '' },
  offlineCaea: {
    pointOfSale: 90,
    cbteTipo: 6,
    letter: 'B',
    number: 6,
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    caea: '31234567890123',
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
    amounts: { totalCents: 12100, netCents: 10000, ivaCents: 2100, exemptCents: 0 },
    ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 10000, amountCents: 2100 }],
    lines: [{ description: 'Pizza', quantity: 1, totalCents: 12100, ivaRate: 21 }],
    ...overrides,
  },
})

describe('al volver la red', () => {
  beforeEach(async () => {
    await PosOfflineDevice.updateOne({ tenantId, deviceId: DEVICE }, { $set: { contingencyPointOfSale: 90 } })
  })

  it('guarda la factura CAEA tal cual se entregó, pendiente de informar, sin reimprimirla', async () => {
    const posId = await paidOffline(caeaInvoice(), cajaId)
    const doc = await FiscalDocument.findOne({ tenantId, orderPosId: posId }).lean()
    expect(doc).toMatchObject({ status: 'authorized', authMode: 'caea', pointOfSale: 90, number: 6, cbteTipo: 6, cae: '31234567890123', caeaReportStatus: 'pending', amounts: { totalCents: 12100 } })
    expect(doc!.qrUrl).toContain('https://www.arca.gob.ar/fe/qr/?p=')
    expect(JSON.parse(Buffer.from(doc!.qrUrl!.split('?p=')[1], 'base64').toString())).toMatchObject({ tipoCodAut: 'A', ptoVta: 90, nroCmp: 6 })
    expect(doc!.printing.status).toBe('printed')
    expect(await PreClosePrintJob.countDocuments({ tenantId })).toBe(0)
    expect((await FiscalCounter.findOne({ tenantId, pointOfSale: 90, cbteTipo: 6 }).lean())!.last).toBe(6)
  })

  it('si no salió por la red local, la imprime el server', async () => {
    await paidOffline(caeaInvoice())
    expect(await PreClosePrintJob.countDocuments({ tenantId, kind: 'fiscal_invoice' })).toBe(1)
  })

  it('lo que no cierra queda en revisión (otro punto de venta, otro CAEA)', async () => {
    const posId = await paidOffline(caeaInvoice({ pointOfSale: 91, caea: '99999999999999' }))
    const doc = await FiscalDocument.findOne({ tenantId, orderPosId: posId }).lean()
    expect(doc).toMatchObject({ status: 'needs_review', authMode: 'caea', caeaReportStatus: 'not_applicable', review: { code: 'caea_offline_mismatch' } })
    expect(doc!.review.message).toMatch(/punto de venta 91/)
    expect(doc!.review.message).toMatch(/CAEA/)
  })

  it('un número repetido no pisa al otro', async () => {
    await paidOffline(caeaInvoice())
    const posId = await paidOffline(caeaInvoice())
    const doc = await FiscalDocument.findOne({ tenantId, orderPosId: posId }).lean()
    expect(doc).toMatchObject({ status: 'needs_review', number: null })
    expect(doc!.review.message).toMatch(/ya existe/)
  })
})
