// ============================================================================
// inventory-transfer-flow.test.ts — circuito de envíos entre sedes (F1)
// ============================================================================
// pedir → autorizar → despachar → recibir con diferencia; envío directo;
// rechazar y cancelar; permisos por rol y por sede; carreras (409).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryState from '@/models/InventoryState'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { auth } from '@/lib/auth'
import { allowedActions, canTransition, lineDifference } from '@/lib/inventory/transfer-flow'
import { POST as skusPost } from '@/app/api/[tenant]/inventory/skus/route'
import { GET as listGet, POST as createPost } from '@/app/api/[tenant]/inventory/transfer-requests/route'
import { PATCH as actionPatch } from '@/app/api/[tenant]/inventory/transfer-requests/[transferId]/route'

const SLUG = 'inv-envios'
let tenant: any
let centro: any, norte: any, sur: any
let stCentro: string, stNorte: string, stSur: string
let carne: string, pan: string
const oid = () => new mongoose.Types.ObjectId().toString()
const ADMIN = oid(), MGR_CENTRO = oid(), MGR_NORTE = oid(), COCINA_CENTRO = oid(), MGR_SUR = oid()

function as(id: string, role: string, assignedLocations: string[] = []) {
  vi.mocked(auth).mockResolvedValue({ user: { id, role, tenantId: tenant._id.toString(), assignedLocations }, expires: '' } as any)
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const PT = (transferId: string) => ({ params: Promise.resolve({ tenant: SLUG, transferId }) })
const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/inventory/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function create(body: Record<string, unknown>) {
  return createPost(req('POST', 'transfer-requests', body), P)
}
async function act(transferId: string, body: Record<string, unknown>) {
  return actionPatch(req('PATCH', `transfer-requests/${transferId}`, body), PT(transferId))
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Envíos', isActive: true, status: 'active', plan: 'full' })
  centro = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  norte = await Location.create({ tenantId: tenant._id, slug: 'norte', name: 'Norte', address: 'Y', isActive: true })
  sur = await Location.create({ tenantId: tenant._id, slug: 'sur', name: 'Sur', address: 'Z', isActive: true })
  const storage = async (loc: any) => String((await InventoryStorageLocation.create({ tenantId: tenant._id, locationId: loc._id, name: `Cocina ${loc.name}`, type: 'kitchen', isDefaultConsumption: true }))._id)
  stCentro = await storage(centro)
  stNorte = await storage(norte)
  stSur = await storage(sur)
  // Usuarios reales: la sesión se valida contra la base (rol y sedes frescos).
  const people: Array<[string, string, any[]]> = [
    [ADMIN, 'admin', []],
    [MGR_CENTRO, 'manager', [centro._id]],
    [MGR_NORTE, 'manager', [norte._id]],
    [COCINA_CENTRO, 'kitchen_lead', [centro._id]],
    [MGR_SUR, 'manager', [sur._id]],
  ]
  for (const [id, role, locs] of people) {
    await User.create({ _id: id, name: `${role} ${id.slice(-4)}`, email: `${id}@envios.test`, password: 'x'.repeat(20), role, tenantId: tenant._id, assignedLocations: locs })
  }
  as(ADMIN, 'admin')
  carne = (await (await skusPost(req('POST', 'skus', { name: 'Carne', category: 'other', canonicalUnit: 'kg', lastUnitCostCents: 1_000_000 }), P)).json()).sku._id
  pan = (await (await skusPost(req('POST', 'skus', { name: 'Pan', category: 'other', canonicalUnit: 'unit', lastUnitCostCents: 20_000 }), P)).json()).sku._id
  // Costo promedio de la carne en Centro: $15.000/kg (viaja con la mercadería).
  await InventoryState.create({ tenantId: tenant._id, locationId: centro._id, skuId: carne, storageLocationId: stCentro, avgUnitCostCents: 1_500_000 })
})

describe('reglas puras', () => {
  it('transiciones y acciones por rol y sede', () => {
    expect(canTransition('requested', 'approve')).toBe(true)
    expect(canTransition('dispatched', 'cancel')).toBe(false)
    expect(canTransition('approved', 'dispatch')).toBe(true)
    const t = { status: 'requested' as const, fromLocationId: 'C', toLocationId: 'N' }
    expect(allowedActions(t, { role: 'manager', scopedLocationIds: ['C'] })).toEqual(['approve', 'reject', 'cancel'])
    expect(allowedActions(t, { role: 'kitchen_lead', scopedLocationIds: ['C'] })).toEqual(['cancel'])
    expect(allowedActions(t, { role: 'manager', scopedLocationIds: ['N'] })).toEqual(['cancel'])
    expect(allowedActions({ ...t, status: 'dispatched' }, { role: 'kitchen_lead', scopedLocationIds: ['N'] })).toEqual(['receive'])
    expect(allowedActions({ ...t, status: 'dispatched' }, { role: 'cashier', scopedLocationIds: null })).toEqual([])
    expect(lineDifference({ dispatched: 8, received: 7.8 })).toBe(0.2)
    expect(lineDifference({ dispatched: 8, received: null })).toBeNull()
  })
})

describe('circuito completo', () => {
  it('Norte pide, Centro autoriza y despacha, Norte recibe menos: queda la diferencia', async () => {
    as(MGR_NORTE, 'manager', [String(norte._id)])
    const created = await create({ fromLocationId: String(centro._id), toLocationId: String(norte._id), lines: [{ skuId: carne, quantity: 8 }, { skuId: pan, quantity: 40 }], note: 'para el finde' })
    expect(created.status).toBe(201)
    const t0 = (await created.json()).transfer
    expect(t0).toMatchObject({ status: 'requested', from: { name: 'Centro' }, to: { name: 'Norte', storageId: stNorte }, actions: ['cancel'] })
    const id = t0.transferId

    // Norte no puede autorizarse a sí mismo (no es de su sede): 404.
    expect((await act(id, { action: 'approve' })).status).toBe(404)
    // Jefe de cocina de Centro: no autoriza.
    as(COCINA_CENTRO, 'kitchen_lead', [String(centro._id)])
    expect((await act(id, { action: 'approve' })).status).toBe(403)

    // Encargado de Centro autoriza menos pan.
    as(MGR_CENTRO, 'manager', [String(centro._id)])
    const approved = await (await act(id, { action: 'approve', lines: [{ skuId: pan, quantity: 30 }] })).json()
    expect(approved.transfer.status).toBe('approved')
    expect(approved.transfer.lines.map((l: any) => l.approved)).toEqual([8, 30])
    expect(await InventoryLedger.countDocuments({ correlationId: id })).toBe(0) // todavía no se movió nada

    // Jefe de cocina de Centro despacha: sale del depósito de Centro.
    as(COCINA_CENTRO, 'kitchen_lead', [String(centro._id)])
    const dispatched = await (await act(id, { action: 'dispatch', fromStorageLocationId: stCentro })).json()
    expect(dispatched.transfer).toMatchObject({ status: 'dispatched', from: { storageId: stCentro } })
    const outs = await InventoryLedger.find({ correlationId: id, eventType: 'TransferOut' }).lean()
    expect(outs.map((e: any) => [String(e.skuId), e.payload.quantity, String(e.storageLocationId)]).sort()).toEqual(
      [[carne, 8, stCentro], [pan, 30, stCentro]].sort(),
    )
    expect(outs.find((e: any) => String(e.skuId) === carne)!.payload.unitCostCents).toBe(1_500_000)
    // Otro intento de despachar: 409 y sin eventos duplicados.
    expect((await act(id, { action: 'dispatch' })).status).toBe(409)
    expect(await InventoryLedger.countDocuments({ correlationId: id, eventType: 'TransferOut' })).toBe(2)

    // Centro no puede recibir lo que va a Norte.
    as(MGR_CENTRO, 'manager', [String(centro._id)])
    expect((await act(id, { action: 'receive' })).status).toBe(404)

    // Norte recibe 7,8 kg de carne y todo el pan.
    as(MGR_NORTE, 'manager', [String(norte._id)])
    const received = await (await act(id, { action: 'receive', lines: [{ skuId: carne, quantity: 7.8 }], note: 'una bolsa abierta' })).json()
    expect(received.transfer.status).toBe('received')
    const carneLine = received.transfer.lines.find((l: any) => l.skuId === carne)
    expect(carneLine).toMatchObject({ dispatched: 8, received: 7.8, difference: 0.2 })
    expect(received.transfer.differenceCostCents).toBe(300_000) // 0,2 kg × $15.000
    const ins = await InventoryLedger.find({ correlationId: id, eventType: 'TransferIn' }).lean()
    expect(ins.map((e: any) => [String(e.skuId), e.payload.quantity, String(e.storageLocationId)]).sort()).toEqual(
      [[carne, 7.8, stNorte], [pan, 30, stNorte]].sort(),
    )
    // El costo de la carne en Norte es el que traía de Centro.
    const stateNorte = await InventoryState.findOne({ skuId: carne, storageLocationId: stNorte }).lean<any>()
    expect(stateNorte.avgUnitCostCents).toBe(1_500_000)
    expect(received.transfer.actions).toEqual([])
  })

  it('envío directo: un encargado del origen manda sin pedido (nace despachada)', async () => {
    as(MGR_CENTRO, 'manager', [String(centro._id)])
    const res = await create({ fromLocationId: String(centro._id), toLocationId: String(sur._id), lines: [{ skuId: carne, quantity: 2 }], dispatchNow: { fromStorageLocationId: stCentro } })
    expect(res.status).toBe(201)
    const t = (await res.json()).transfer
    expect(t.status).toBe('dispatched')
    expect(await InventoryLedger.countDocuments({ correlationId: t.transferId, eventType: 'TransferOut' })).toBe(1)

    // El jefe de cocina no puede hacer envíos directos; el encargado de Norte no puede mandar desde Centro.
    as(COCINA_CENTRO, 'kitchen_lead', [String(centro._id)])
    expect((await create({ fromLocationId: String(centro._id), toLocationId: String(sur._id), lines: [{ skuId: carne, quantity: 1 }], dispatchNow: { fromStorageLocationId: stCentro } })).status).toBe(403)
    as(MGR_NORTE, 'manager', [String(norte._id)])
    expect((await create({ fromLocationId: String(centro._id), toLocationId: String(norte._id), lines: [{ skuId: carne, quantity: 1 }], dispatchNow: { fromStorageLocationId: stCentro } })).status).toBe(404)
  })
})

describe('rechazar, cancelar y alcance', () => {
  async function requestFromNorte() {
    as(MGR_NORTE, 'manager', [String(norte._id)])
    return (await (await create({ fromLocationId: String(centro._id), toLocationId: String(norte._id), lines: [{ skuId: carne, quantity: 3 }] })).json()).transfer.transferId as string
  }

  it('rechazo con motivo; ya rechazada no se despacha', async () => {
    const id = await requestFromNorte()
    as(MGR_CENTRO, 'manager', [String(centro._id)])
    const r = await (await act(id, { action: 'reject', reason: 'no nos alcanza' })).json()
    expect(r.transfer).toMatchObject({ status: 'rejected', rejectReason: 'no nos alcanza' })
    expect((await act(id, { action: 'approve' })).status).toBe(409)
  })

  it('quien pidió cancela antes de despachar; después no', async () => {
    const id = await requestFromNorte()
    expect((await (await act(id, { action: 'cancel' })).json()).transfer.status).toBe('cancelled')

    const id2 = await requestFromNorte()
    as(MGR_CENTRO, 'manager', [String(centro._id)])
    await act(id2, { action: 'approve' })
    await act(id2, { action: 'dispatch', fromStorageLocationId: stCentro })
    as(MGR_NORTE, 'manager', [String(norte._id)])
    expect((await act(id2, { action: 'cancel' })).status).toBe(409)
  })

  it('una sede ajena no ve ni toca el envío', async () => {
    const id = await requestFromNorte()
    as(MGR_SUR, 'manager', [String(sur._id)])
    const list = await (await listGet(req('GET', 'transfer-requests'), P)).json()
    expect(list.transfers).toHaveLength(0)
    expect(list.sedes.map((s: any) => s.name)).toEqual(['Centro', 'Norte', 'Sur']) // para elegir a quién pedir
    expect((await act(id, { action: 'cancel' })).status).toBe(404)

    as(ADMIN, 'admin')
    const all = await (await listGet(req('GET', 'transfer-requests?estado=abiertas'), P)).json()
    expect(all.transfers.map((t: any) => t.transferId)).toEqual([id])
    expect((await (await listGet(req('GET', 'transfer-requests?estado=cerradas'), P)).json()).transfers).toHaveLength(0)
  })

  it('validaciones: misma sede, insumo repetido o inexistente, depósito de otra sede; cajero sin acceso', async () => {
    as(ADMIN, 'admin')
    const base = { fromLocationId: String(centro._id), toLocationId: String(norte._id) }
    expect((await create({ ...base, toLocationId: String(centro._id), lines: [{ skuId: carne, quantity: 1 }] })).status).toBe(400)
    expect((await create({ ...base, lines: [{ skuId: carne, quantity: 1 }, { skuId: carne, quantity: 2 }] })).status).toBe(400)
    expect((await create({ ...base, lines: [{ skuId: oid(), quantity: 1 }] })).status).toBe(400)
    expect((await create({ ...base, lines: [{ skuId: carne, quantity: 0 }] })).status).toBe(400)
    expect((await create({ ...base, toStorageLocationId: stSur, lines: [{ skuId: carne, quantity: 1 }] })).status).toBe(400)
    as('cajero-1', 'cashier')
    expect((await create({ ...base, lines: [{ skuId: carne, quantity: 1 }] })).status).toBe(403)
  })
})
