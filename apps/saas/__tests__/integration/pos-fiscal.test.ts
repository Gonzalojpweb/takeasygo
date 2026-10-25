import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { GET as listDocs } from '@/app/api/[tenant]/pos/fiscal/documents/route'
import { POST as reprint } from '@/app/api/[tenant]/pos/fiscal/documents/[id]/reprint/route'
import { POST as creditNote } from '@/app/api/[tenant]/pos/fiscal/documents/[id]/credit-note/route'
import { GET as libroIva } from '@/app/api/[tenant]/pos/fiscal/libro-iva/route'

/**
 * Fase L (2026-10): factura electrónica operada desde el POS.
 *   · lista de comprobantes de la sede (no de otras), con totales y estado.
 *   · reimprimir el ticket fiscal (requiere impresora de caja).
 *   · nota de crédito: el cajero necesita PIN de encargado; solo sobre
 *     facturas autorizadas.
 *   · Libro IVA: solo encargado y admin.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'test-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos/fiscal`

let tenantId: string
let locationId: string
let otherLocationId: string

const token = (role: 'cashier' | 'manager' | 'waiter') => signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
const AUTH = (role: 'cashier' | 'manager' | 'waiter' = 'cashier') => ({ authorization: `Bearer ${token(role)}`, 'x-location-id': locationId })
const req = (url: string, headers: Record<string, string>, method = 'GET') =>
  new Request(url, { method, headers: { 'content-type': 'application/json', ...headers } }) as unknown as NextRequest
const listParams = { params: Promise.resolve({ tenant: SLUG }) }
const idParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

let seq = 15
async function makeDoc(over: Record<string, unknown> = {}) {
  const number = seq++
  return FiscalDocument.create({
    tenantId, locationId, orderId: new mongoose.Types.ObjectId(), kind: 'invoice', letter: 'B', cbteTipo: 6, pointOfSale: 3,
    environment: 'homologation', status: 'authorized', number, cae: '76123456789012', issuedAt: new Date(),
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: 'Consumidor final' },
    amounts: { totalCents: 12100, netCents: 10000, ivaCents: 2100, exemptCents: 0 },
    idempotencyKey: `invoice:${new mongoose.Types.ObjectId()}`, createdBy: 'test',
    ...over,
  })
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id.toString()
  seq = 15
  otherLocationId = (await Location.create({ tenantId, name: 'Norte', slug: 'norte', address: 'Calle 2', isActive: true }))._id.toString()
})

describe('comprobantes de la sede', () => {
  it('lista solo los de la sede del token, con totales y estado', async () => {
    await makeDoc()
    await makeDoc({ status: 'pending', number: null, cae: null })
    await makeDoc({ locationId: otherLocationId })
    const res = await listDocs(req(`${BASE}/documents`, AUTH()), listParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toHaveLength(2)
    expect(body.counts).toEqual({ authorized: 1, pending: 1, rejected: 0 })
    expect(body.totals.invoicedCents).toBe(12100)
    expect(body.documents.find((d: { status: string }) => d.status === 'authorized').label).toBe('Factura B 00003-00000015')
  })

  it('el mozo no ve los comprobantes', async () => {
    expect((await listDocs(req(`${BASE}/documents`, AUTH('waiter')), listParams)).status).toBe(403)
  })
})

describe('reimprimir y nota de crédito', () => {
  it('reimprime en la impresora de caja; sin impresora → 409', async () => {
    const doc = await makeDoc()
    expect((await reprint(req(`${BASE}/documents/${doc._id}/reprint`, AUTH(), 'POST'), idParams(String(doc._id)))).status).toBe(409)
    await Printer.create({ tenantId, locationId, uid: 'caja', name: 'Caja', ip: '10.0.0.2', roles: ['cashier'] })
    await FiscalProfile.create({ tenantId, legalName: 'Comercio SA', cuit: '30712345674', ivaCondition: 'responsable_inscripto' })
    const ok = await reprint(req(`${BASE}/documents/${doc._id}/reprint`, AUTH(), 'POST'), idParams(String(doc._id)))
    expect(ok.status).toBe(200)
    expect(await PreClosePrintJob.countDocuments({ tenantId })).toBe(1)
  })

  it('nota de crédito: el cajero necesita PIN; sobre una factura no autorizada → 409', async () => {
    const doc = await makeDoc()
    const noPin = await creditNote(req(`${BASE}/documents/${doc._id}/credit-note`, AUTH(), 'POST'), idParams(String(doc._id)))
    expect(noPin.status).toBe(403)
    expect((await noPin.json()).error.code).toBe('approval_required')

    const pending = await makeDoc({ status: 'pending', number: null, cae: null })
    const res = await creditNote(req(`${BASE}/documents/${pending._id}/credit-note`, AUTH('manager'), 'POST'), idParams(String(pending._id)))
    expect(res.status).toBe(409)
  })

  it('un comprobante de otra sede no existe para este POS', async () => {
    const other = await makeDoc({ locationId: otherLocationId })
    expect((await reprint(req(`${BASE}/documents/${other._id}/reprint`, AUTH(), 'POST'), idParams(String(other._id)))).status).toBe(404)
  })
})

describe('Libro IVA', () => {
  it('solo encargado y admin; devuelve totales y el CSV', async () => {
    await makeDoc()
    const month = new Date().toISOString().slice(0, 7)
    expect((await libroIva(req(`${BASE}/libro-iva?month=${month}`, AUTH()), listParams)).status).toBe(403)
    const res = await libroIva(req(`${BASE}/libro-iva?month=${month}`, AUTH('manager')), listParams)
    expect(res.status).toBe(200)
    expect((await res.json()).totals).toBeTruthy()
    const csv = await libroIva(req(`${BASE}/libro-iva?month=${month}&format=csv`, AUTH('manager')), listParams)
    expect(csv.headers.get('content-type')).toContain('text/csv')
  })
})
