import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import FiscalProfile from '@/models/FiscalProfile'
import { signJwt } from '@takeasygo/business/jwt'
import { effectiveDocuments, validatePrinterDocuments, rolesForDocuments } from '@takeasygo/business'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { printerForDocument } from '@/lib/printers/select'
import type { NextRequest } from 'next/server'

import { GET as printersGet, POST as printersPost } from '@/app/api/[tenant]/pos/config/printers/route'
import { PATCH as printerPatch } from '@/app/api/[tenant]/pos/config/printers/[id]/route'
import { GET as previewGet } from '@/app/api/[tenant]/pos/config/printers/preview/route'
import { GET as fiscalGet, PATCH as fiscalPatch } from '@/app/api/[tenant]/pos/config/fiscal/route'
import { GET as platformsGet, PUT as platformsPut } from '@/app/api/[tenant]/pos/config/delivery-platforms/route'

/**
 * Fase 1 (29/10/2026) — Configuración del POS: impresoras por documento,
 * tope por plan, vista previa y comprobantes.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'cafe-demo'
const BASE = `http://localhost:3000/api/${SLUG}/pos/config`

type Role = 'admin' | 'manager' | 'cashier' | 'waiter'
let tenantId: string
let locationId: string

const AUTH = (role: Role = 'admin') => ({
  authorization: `Bearer ${signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: role === 'waiter' ? 'handheld' : 'hub' }, PRIVATE_PEM)}`,
  'x-location-id': locationId,
})
function req(url: string, body?: unknown, role: Role = 'admin', method = body === undefined ? 'GET' : 'POST'): NextRequest {
  return new Request(url, { method, headers: { 'content-type': 'application/json', ...AUTH(role) }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const IP = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Café Demo', slug: SLUG, plan: 'try', features: { posEnabled: true } })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Av. Demo 1', isActive: true })
  locationId = loc._id.toString()
})

describe('documentos por impresora (business/printing)', () => {
  it('una impresora vieja sin documentos imprime los de su rol', () => {
    expect(effectiveDocuments({ roles: ['kitchen'] })).toEqual(['comanda'])
    expect(effectiveDocuments({ roles: ['cashier'] })).toEqual(['ticket', 'precuenta', 'factura', 'nota_credito', 'reporte_caja'])
    expect(effectiveDocuments({ roles: ['cashier'], documents: ['precuenta'] })).toEqual(['precuenta'])
  })

  it('sin POS solo se aceptan comandas y tickets no fiscales', () => {
    expect(validatePrinterDocuments(['comanda', 'ticket'], false)).toEqual({ ok: true, documents: ['comanda', 'ticket'] })
    const bad = validatePrinterDocuments(['factura'], false)
    expect(bad.ok).toBe(false)
    expect(validatePrinterDocuments(['factura', 'reporte_caja'], true).ok).toBe(true)
    expect(validatePrinterDocuments([], true).ok).toBe(false)
  })

  it('los roles del agente siguen a los documentos y conservan «barra»', () => {
    expect(rolesForDocuments(['comanda'], ['bar'])).toEqual(['bar'])
    expect(rolesForDocuments(['comanda', 'factura'])).toEqual(['kitchen', 'cashier'])
  })
})

describe('Configuración › Impresoras', () => {
  it('alta, tope del plan (Inicial: 2 por sede) y lista con documentos', async () => {
    const a = await printersPost(req(`${BASE}/printers`, { name: 'Cocina', ip: '192.168.0.10', documents: ['comanda'] }), P)
    expect(a.status).toBe(201)
    const b = await printersPost(req(`${BASE}/printers`, { name: 'Caja', ip: '192.168.0.11', documents: ['precuenta', 'factura', 'nota_credito', 'reporte_caja', 'ticket'] }), P)
    expect(b.status).toBe(201)
    const c = await printersPost(req(`${BASE}/printers`, { name: 'Barra', ip: '192.168.0.12' }), P)
    expect(c.status).toBe(409)

    const list = await (await printersGet(req(`${BASE}/printers`), P)).json()
    expect(list).toMatchObject({ limit: 2, active: 2 })
    expect(list.printers.find((p: { name: string }) => p.name === 'Caja').documents).toContain('factura')
  })

  it('cada documento sale por la impresora que lo declara', async () => {
    await printersPost(req(`${BASE}/printers`, { name: 'A cocina', ip: '192.168.0.10', documents: ['comanda'] }), P)
    await printersPost(req(`${BASE}/printers`, { name: 'B caja', ip: '192.168.0.11', documents: ['precuenta', 'factura'] }), P)
    expect((await printerForDocument(tenantId, locationId, 'factura'))?.name).toBe('B caja')
    expect((await printerForDocument(tenantId, locationId, 'precuenta'))?.name).toBe('B caja')
    expect(await printerForDocument(tenantId, locationId, 'reporte_caja')).toBeNull()
  })

  it('editar documentos, estilos y reactivar respetando el tope', async () => {
    const created = (await (await printersPost(req(`${BASE}/printers`, { name: 'Caja', ip: '192.168.0.11', documents: ['ticket'] }), P)).json()).printer
    const res = await printerPatch(
      req(`${BASE}/printers/${created.id}`, { documents: ['precuenta', 'reporte_caja'], paperWidth: 58, printSettings: { cashier: { fontSize: 'large', headerTemplate: '¡Gracias!' } } }, 'manager', 'PATCH'),
      IP(created.id)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()).printer
    expect(body).toMatchObject({ documents: ['precuenta', 'reporte_caja'], paperWidth: 58, columns: 32 })
    expect(body.printSettings.cashier).toMatchObject({ fontSize: 'large', headerTemplate: '¡Gracias!' })

    await printerPatch(req(`${BASE}/printers/${created.id}`, { isActive: false }, 'admin', 'PATCH'), IP(created.id))
    await printersPost(req(`${BASE}/printers`, { name: 'Otra 1', ip: '192.168.0.20' }), P)
    await printersPost(req(`${BASE}/printers`, { name: 'Otra 2', ip: '192.168.0.21' }), P)
    const back = await printerPatch(req(`${BASE}/printers/${created.id}`, { isActive: true }, 'admin', 'PATCH'), IP(created.id))
    expect(back.status).toBe(409)
  })

  it('valida IP, estilos y no deja editar impresoras de otra sede', async () => {
    expect((await printersPost(req(`${BASE}/printers`, { name: 'Mala', ip: '999.1.1.1' }), P)).status).toBe(400)
    const other = await Printer.create({ tenantId, locationId: new mongoose.Types.ObjectId(), uid: 'X', name: 'Ajena', ip: '10.0.0.1' })
    const res = await printerPatch(req(`${BASE}/printers/${other._id}`, { name: 'Mía' }, 'admin', 'PATCH'), IP(String(other._id)))
    expect(res.status).toBe(404)
    const created = (await (await printersPost(req(`${BASE}/printers`, { name: 'Caja', ip: '192.168.0.11' }), P)).json()).printer
    const bad = await printerPatch(req(`${BASE}/printers/${created.id}`, { printSettings: { cashier: { fontSize: 'gigante' } } }, 'admin', 'PATCH'), IP(created.id))
    expect(bad.status).toBe(400)
  })

  it('el cajero y el mozo no entran a Configuración', async () => {
    expect((await printersGet(req(`${BASE}/printers`, undefined, 'cashier'), P)).status).toBe(403)
    expect((await printersPost(req(`${BASE}/printers`, { name: 'X', ip: '192.168.0.9' }, 'waiter'), P)).status).toBe(403)
  })

  it('vista previa con el renderer real y las columnas del ancho', async () => {
    const r80 = await (await previewGet(req(`${BASE}/printers/preview?doc=precuenta&width=80&header=Hola`), P)).json()
    expect(r80.columns).toBe(48)
    expect(r80.lines[0].text).toBe('Hola')
    expect(r80.lines.every((l: { text: string }) => l.text.length <= 48)).toBe(true)
    const r58 = await (await previewGet(req(`${BASE}/printers/preview?doc=factura&width=58`), P)).json()
    expect(r58.columns).toBe(32)
    expect(r58.lines.some((l: { text: string }) => l.text.startsWith('FACTURA B'))).toBe(true)
    expect(r58.lines.every((l: { text: string }) => l.text.length <= 32)).toBe(true)
    expect((await previewGet(req(`${BASE}/printers/preview?doc=otro&width=80`), P)).status).toBe(400)
  })
})

describe('Configuración › Comprobantes', () => {
  beforeEach(async () => {
    await FiscalProfile.create({
      tenantId,
      enabled: true,
      legalName: 'CAFE DEMO SRL',
      cuit: '30712345679',
      ivaCondition: 'responsable_inscripto',
      invoicingMode: 'ask',
      environment: 'homologation',
      pointsOfSale: [{ locationId, number: 3 }],
    })
  })

  it('muestra letras y punto de venta de la sede, sin secretos', async () => {
    const view = await (await fiscalGet(req(`${BASE}/fiscal`, undefined, 'manager'), P)).json()
    expect(view).toMatchObject({ configured: true, letterForFinalConsumer: 'B', letterForCompany: 'A', pointOfSale: 3, invoicingMode: 'ask', environment: 'homologation' })
    expect(JSON.stringify(view)).not.toMatch(/cuit|certificate|privateKey/i)
  })

  it('el modo de cobro lo cambia solo el admin', async () => {
    expect((await fiscalPatch(req(`${BASE}/fiscal`, { invoicingMode: 'always' }, 'manager', 'PATCH'), P)).status).toBe(403)
    const ok = await fiscalPatch(req(`${BASE}/fiscal`, { invoicingMode: 'always' }, 'admin', 'PATCH'), P)
    expect((await ok.json()).invoicingMode).toBe('always')
    expect((await fiscalPatch(req(`${BASE}/fiscal`, { invoicingMode: 'siempre' }, 'admin', 'PATCH'), P)).status).toBe(400)
  })
})

describe('Configuración › Deliverys (fase 5)', () => {
  it('lista las 4 plataformas, guarda comisión y quién cobra; el cajero no entra', async () => {
    const empty = (await (await platformsGet(req(`${BASE}/delivery-platforms`), P)).json()).platforms
    expect(empty.map((p: { id: string; enabled: boolean }) => [p.id, p.enabled])).toEqual([['pedidosya', false], ['rappi', false], ['uber_eats', false], ['didi_food', false]])
    const res = await platformsPut(req(`${BASE}/delivery-platforms`, { platforms: [{ id: 'pedidosya', enabled: true, commissionPercent: 25, settlement: 'local' }] }, 'manager', 'PUT'), P)
    expect(res.status).toBe(200)
    const saved = (await res.json()).platforms.find((p: { id: string }) => p.id === 'pedidosya')
    expect(saved).toMatchObject({ enabled: true, commissionPercent: 25, settlement: 'local' })
    expect((await platformsPut(req(`${BASE}/delivery-platforms`, { platforms: [{ id: 'pedidosya', commissionPercent: 99, settlement: 'local' }] }, 'admin', 'PUT'), P)).status).toBe(400)
    expect((await platformsGet(req(`${BASE}/delivery-platforms`, undefined, 'cashier'), P)).status).toBe(403)
  })
})
