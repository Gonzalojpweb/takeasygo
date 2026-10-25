import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import FiscalDocument from '@/models/FiscalDocument'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryState from '@/models/InventoryState'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'
import { GET as salesView } from '@/app/api/[tenant]/pos/reports/sales/view/route'
import { GET as salesExport } from '@/app/api/[tenant]/pos/reports/sales/export/route'

/**
 * Contexto Ventas del POS (2026-10-25): filtros dentro del workspace por
 * canal (salón, mostrador, app, marketplaces), estado, medio de pago,
 * facturación, modo, plataforma y franja horaria; KPIs y listado sobre el
 * MISMO conjunto; costo de mercadería desde el inventario; cajero sin dinero.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'test-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos/reports/sales`

let tenantId: string
let locationId: string
const token = (role: 'cashier' | 'manager') => signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
const AUTH = (role: 'cashier' | 'manager' = 'manager') => ({ authorization: `Bearer ${token(role)}`, 'x-location-id': locationId })
const params = { params: Promise.resolve({ tenant: SLUG }) }
const view = async (qs: string, role: 'cashier' | 'manager' = 'manager') => {
  const res = await salesView(new Request(`${BASE}/view${qs}`, { headers: AUTH(role) }) as unknown as NextRequest, params)
  return { status: res.status, body: await res.json() }
}

// Hoy 13:00 hora Argentina (UTC-3) para que el rango «hoy» lo incluya.
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const at = (hh: number) => new Date(`${today}T${String(hh).padStart(2, '0')}:00:00-03:00`)

const item = (name: string, price: number, qty = 1) => ({ name, quantity: qty, basePrice: price, extraPrice: 0, price, subtotal: price * qty, menuItemId: new mongoose.Types.ObjectId() })
let seq = 0
async function sale(over: Record<string, unknown>) {
  seq++
  return Order.create({
    tenantId, locationId, orderNumber: `V-${seq}`, status: 'delivered', orderMode: 'takeaway',
    items: [item('Milanesa', 1_000_000)], subtotal: 1_000_000, total: 1_000_000,
    customer: { name: 'Cliente', phone: '+5491100000000' },
    payment: { method: 'cash', status: 'approved' },
    ...over,
  })
}
const posPay = (method: string, amount: number) => [{ posId: crypto.randomUUID(), method, amount, userId: 'u1', paidAt: new Date() }]

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

let salon: string, mostrador: string, app: string, rappi: string, voided: string
const skuId = new mongoose.Types.ObjectId()

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  tenantId = (await Tenant.create({ name: 'Bodegón', slug: SLUG, plan: 'full' }))._id.toString()
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id.toString()

  salon = String((await sale({ source: 'pos', posId: 'p1', posTableId: 't1', guests: 4, createdAt: at(13), posPayments: posPay('posnet_debit', 1_000_000) }))._id)
  mostrador = String((await sale({ source: 'pos', posId: 'p2', createdAt: at(21), posPayments: posPay('cash', 1_000_000) }))._id)
  app = String((await sale({ source: 'web', orderMode: 'delivery', createdAt: at(20), payment: { method: 'mercadopago', status: 'approved' } }))._id)
  rappi = String((await sale({ source: 'web', channel: 'rappi', createdAt: at(12), payment: { method: 'mercadopago', status: 'approved' } }))._id)
  voided = String((await sale({ source: 'pos', posId: 'p3', createdAt: at(14), posPayments: posPay('cash', 1_000_000), voided: { at: new Date(), by: 'u1', approvedBy: 'u2', reason: 'other', registerPosId: 'r1' } }))._id)

  // Facturación: el salón facturado; la app con factura pendiente de ARCA.
  const fiscal = (orderId: string, status: string, number: number | null) => FiscalDocument.create({
    tenantId, locationId, orderId, kind: 'invoice', letter: 'B', cbteTipo: 6, pointOfSale: 3, environment: 'homologation', status, number,
    issuedAt: new Date(), receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0' },
    amounts: { totalCents: 1_000_000, netCents: 826_446, ivaCents: 173_554, exemptCents: 0 },
    idempotencyKey: `invoice:${orderId}`, createdBy: 'test',
  })
  await fiscal(salon, 'authorized', 15)
  await fiscal(app, 'pending', null)

  // Inventario: la milanesa del salón consumió 0,25 kg de carne a $8.000/kg.
  await InventoryState.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tenantId), locationId: new mongoose.Types.ObjectId(locationId), skuId, storageLocationId: new mongoose.Types.ObjectId(), avgUnitCostCents: 800_000 })
  await InventoryLedger.collection.insertOne({
    eventId: `sale:${salon}:l1:0`, tenantId: new mongoose.Types.ObjectId(tenantId), locationId: new mongoose.Types.ObjectId(locationId),
    eventType: 'SaleRecorded', occurredAt: new Date(), recordedAt: new Date(), source: 'pos', correlationId: salon,
    payload: { orderId: salon, name: 'Milanesa', portions: 1, unmapped: false, consumption: [{ skuId: String(skuId), quantity: 0.25 }] },
  })
})

describe('vista de ventas filtrada', () => {
  it('todas: KPIs, canales, facturación y costo sobre el mismo conjunto', async () => {
    const { status, body } = await view('')
    expect(status).toBe(200)
    expect(body.total).toBe(5) // 4 cobradas + 1 anulada
    expect(body.metrics.totals.sales).toBe(4)
    expect(body.metrics.byChannel.salon.sales).toBe(1)
    expect(body.metrics.byChannel.delivery.sales).toBe(1)
    expect(body.invoicing.invoiced).toEqual({ count: 1, amount: 1_000_000 })
    expect(body.invoicing.pending.count).toBe(1)
    expect(body.invoicing.notInvoiced.count).toBe(2)
    expect(body.cost).toMatchObject({ available: true, cmvCents: 200_000, grossMarginCents: 800_000, foodCostPct: 20 })
    const row = body.rows.find((r: { id: string }) => r.id === salon)
    expect(row.fiscal).toEqual({ state: 'invoiced', label: 'Factura B 00003-00000015' })
    expect(row.costCents).toBe(200_000)
    expect(body.byPlatform).toEqual([{ platform: 'rappi', sales: 1, revenue: 1_000_000 }])
    expect(body.byMode).toEqual([{ mode: 'delivery', sales: 1, revenue: 1_000_000 }])
  })

  it('filtra por canal, estado, medio, facturación, modo, plataforma y franja horaria', async () => {
    expect((await view('?channel=delivery')).body.rows.map((r: { id: string }) => r.id)).toEqual([rappi])
    expect((await view('?status=voided')).body.rows.map((r: { id: string }) => r.id)).toEqual([voided])
    expect((await view('?status=billed')).body.total).toBe(4)
    expect((await view('?payment=posnet_debit')).body.rows.map((r: { id: string }) => r.id)).toEqual([salon])
    expect((await view('?payment=mercadopago')).body.total).toBe(2)
    expect((await view('?invoice=invoiced')).body.rows.map((r: { id: string }) => r.id)).toEqual([salon])
    expect((await view('?invoice=pending')).body.rows.map((r: { id: string }) => r.id)).toEqual([app])
    expect((await view('?channel=app&mode=delivery')).body.rows.map((r: { id: string }) => r.id)).toEqual([app])
    expect((await view('?platform=rappi')).body.total).toBe(1)
    // Turno noche 20→02 (cruza la medianoche): app 20 h y mostrador 21 h.
    const night = (await view('?hourFrom=20&hourTo=2')).body
    expect(night.rows.map((r: { id: string }) => r.id).sort()).toEqual([app, mostrador].sort())
    expect(night.metrics.totals.sales).toBe(2) // los KPIs siguen al filtro
  })

  it('valores inválidos se ignoran (no rompen la vista)', async () => {
    const { status, body } = await view('?channel=x&status=y&payment=z&invoice=w&hourFrom=30&hourTo=2')
    expect(status).toBe(200)
    expect(body.filters).toMatchObject({ channel: 'all', status: 'all', payment: 'all', invoice: 'all', hourFrom: null, hourTo: null })
  })

  it('el cajero ve cantidades, no dinero ni costo', async () => {
    const { body } = await view('', 'cashier')
    expect(body.revenueVisible).toBe(false)
    expect(body.metrics.totals.sales).toBe(4)
    expect(body.metrics.totals.revenue).toBeNull()
    expect(body.cost.cmvCents).toBeNull()
    expect(body.invoicing.invoiced.amount).toBeNull()
    expect(body.rows[0].total).toBeNull()
    expect(body.rows[0].costCents).toBeNull()
  })

  it('el export respeta los filtros', async () => {
    const res = await salesExport(new Request(`${BASE}/export?format=xlsx&invoice=invoiced`, { headers: AUTH() }) as unknown as NextRequest, params)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheet')
  })
})
