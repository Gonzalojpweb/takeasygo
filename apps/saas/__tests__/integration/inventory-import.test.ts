// ============================================================================
// inventory-import.test.ts — Importador de inventario v1 (30/10/2026)
// ============================================================================
// Vista previa (no escribe) → carga (insumos + conteo de apertura, sede en
// preparación) → deshacer (desactiva lo creado que nadie usó). Más permisos.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import InventorySKU from '@/models/InventorySKU'
import InventoryState from '@/models/InventoryState'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryImport from '@/models/InventoryImport'
import { auth } from '@/lib/auth'
import { POST as previewPost } from '@/app/api/[tenant]/inventory/import/preview/route'
import { GET as importsGet, POST as importPost } from '@/app/api/[tenant]/inventory/import/route'
import { POST as undoPost } from '@/app/api/[tenant]/inventory/import/[importId]/undo/route'
import { GET as setupGet } from '@/app/api/[tenant]/inventory/setup/route'

const SLUG = 'import-inv'
let tenant: any
let loc: any

function as(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user: { tenantId: tenant._id.toString(), assignedLocations: [], ...user }, expires: '' } as any)
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const url = (path: string) => `http://localhost/api/${SLUG}/inventory/${path}`
const json = (method: string, path: string, body?: unknown) =>
  new NextRequest(url(path), { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

function csvUpload(text: string, name = 'stock.csv') {
  const form = new FormData()
  form.append('file', new File([text], name, { type: 'text/csv' }))
  return new NextRequest(url('import/preview'), { method: 'POST', body: form })
}

const row = (over: Record<string, unknown>) => ({
  name: 'Harina 000', category: 'dry_goods', unit: 'kg', quantity: 12.5, parLevel: 5, costCents: 85000, supplier: 'Molino', code: 'H0', ...over,
})

beforeEach(async () => {
  tenant = await Tenant.create({ slug: SLUG, name: 'Importa', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  as({ id: 'admin-1', role: 'admin' })
})

describe('vista previa', () => {
  it('lee el CSV, normaliza y marca lo que ya existe, sin escribir', async () => {
    await InventorySKU.create({ tenantId: tenant._id, name: 'Aceite', nameKey: 'aceite', category: 'dry_goods', canonicalUnit: 'l' })
    const res = await previewPost(csvUpload('Descripción;UM;Existencia;Costo\nHarina 000;Kg;12,5;850\nAceite;Lts;3;2100\nTomate;Bulto;2;\n'), P)
    expect(res.status).toBe(200)
    const body = await res.json()
    const rows = body.sheets[0].rows
    expect(rows[0]).toMatchObject({ name: 'Harina 000', unit: 'kg', quantity: 12.5, costCents: 85000, include: true, match: null })
    expect(rows[1].match).toMatchObject({ name: 'Aceite', unit: 'l' })
    expect(rows[2]).toMatchObject({ unit: 'unit', status: 'warn' })
    expect(await InventorySKU.countDocuments({ tenantId: tenant._id })).toBe(1)
  })

  it('archivo no soportado → 400 con instrucciones', async () => {
    const form = new FormData()
    form.append('file', new File(['x'], 'viejo.xls'))
    const res = await previewPost(new NextRequest(url('import/preview'), { method: 'POST', body: form }), P)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/\.xlsx/)
  })
})

describe('carga y deshacer', () => {
  it('crea insumos, carga el stock como conteo y deja la sede EN PREPARACIÓN', async () => {
    const res = await importPost(json('POST', 'import', {
      locationId: String(loc._id), fileName: 'stock.xlsx', source: 'fudo', skipped: 1,
      rows: [row({}), row({ name: 'Té', category: 'dry_goods', unit: 'unit', quantity: 0, parLevel: 50, costCents: null, supplier: null, code: null }), row({ name: 'Medialuna', unit: 'unit', quantity: null, code: null })],
    }), P)
    expect(res.status).toBe(201)
    const out = await res.json()
    expect(out).toMatchObject({ created: 3, matched: 0, stockLoaded: 2, skipped: 1, preparedLocation: true })

    const harina = await InventorySKU.findOne({ tenantId: tenant._id, nameKey: 'harina 000' }).lean<any>()
    expect(harina).toMatchObject({ canonicalUnit: 'kg', parLevel: 5, lastUnitCostCents: 85000, supplierName: 'Molino', skuCode: 'H0' })
    const ev = await InventoryLedger.findOne({ tenantId: tenant._id, skuId: harina._id }).lean<any>()
    expect(ev).toMatchObject({ eventType: 'PhysicalCountObserved', observationMethod: 'estimation', correlationId: `import:${out.importId}` })
    const state = await InventoryState.findOne({ tenantId: tenant._id, skuId: harina._id }).lean<any>()
    expect(state).toBeTruthy()

    const setup = await (await setupGet(json('GET', 'setup'), P)).json()
    expect(setup.locations[0].status).toBe('preparing')

    const hist = await (await importsGet(json('GET', `import?locationId=${loc._id}`), P)).json()
    expect(hist.imports[0]).toMatchObject({ source: 'fudo', fileName: 'stock.xlsx', status: 'done' })
  })

  it('un insumo existente se reutiliza; otra dimensión de unidad no se carga', async () => {
    await InventorySKU.create({ tenantId: tenant._id, name: 'Harina 000', nameKey: 'harina 000', category: 'dry_goods', canonicalUnit: 'g' })
    await InventorySKU.create({ tenantId: tenant._id, name: 'Leche', nameKey: 'leche', category: 'dairy', canonicalUnit: 'l' })
    const out = await (await importPost(json('POST', 'import', {
      locationId: String(loc._id), fileName: 'x.csv', source: 'generic',
      rows: [row({}), row({ name: 'Leche', category: 'dairy', unit: 'kg', quantity: 4 })],
    }), P)).json()
    expect(out).toMatchObject({ created: 0, matched: 1, stockLoaded: 1 })
    expect(out.problems[0].name).toBe('Leche')
    // 12,5 kg contados en un insumo medido en gramos.
    const harina = await InventorySKU.findOne({ tenantId: tenant._id, nameKey: 'harina 000' }).lean<any>()
    const ev = await InventoryLedger.findOne({ skuId: harina._id }).lean<any>()
    expect(ev.payload.observedQuantity).toBe(12500)
  })

  it('deshacer desactiva lo creado que nadie usó y no se puede repetir', async () => {
    const out = await (await importPost(json('POST', 'import', {
      locationId: String(loc._id), fileName: 'x.csv', source: 'generic', rows: [row({}), row({ name: 'Azúcar', code: 'AZ1' })],
    }), P)).json()
    const azucar = await InventorySKU.findOne({ tenantId: tenant._id, nameKey: 'azucar' }).lean<any>()
    // Alguien lo usó después de importar: un ajuste ajeno al lote.
    await InventoryLedger.create({
      eventId: 'manual-1', tenantId: tenant._id, locationId: loc._id, skuId: azucar._id, storageLocationId: (await InventoryLedger.findOne({ skuId: azucar._id }).lean<any>()).storageLocationId,
      eventType: 'PhysicalCountObserved', occurredAt: new Date(), recordedAt: new Date(), source: 'manual', payload: { observedQuantity: 1, unit: 'kg' }, eventVersion: 2,
    })
    const undo = await (await undoPost(json('POST', `import/${out.importId}/undo`), { params: Promise.resolve({ tenant: SLUG, importId: out.importId }) })).json()
    expect(undo.deactivated).toBe(1)
    expect(undo.kept).toEqual([{ name: 'Azúcar', reason: 'ya tiene movimientos o recetas' }])
    expect((await InventorySKU.findOne({ nameKey: 'harina 000' }).lean<any>()).isActive).toBe(false)
    expect((await InventoryImport.findById(out.importId).lean<any>()).status).toBe('undone')
    const again = await undoPost(json('POST', `import/${out.importId}/undo`), { params: Promise.resolve({ tenant: SLUG, importId: out.importId }) })
    expect(again.status).toBe(409)
  })
})

describe('permisos', () => {
  it('cocina y caja no importan; el encargado sí', async () => {
    const body = { locationId: String(loc._id), fileName: 'x.csv', source: 'generic', rows: [row({})] }
    as({ id: 'k1', role: 'kitchen_lead' })
    expect((await importPost(json('POST', 'import', body), P)).status).toBe(403)
    as({ id: 'c1', role: 'cashier' })
    expect((await previewPost(csvUpload('Nombre;Stock\nSal;1\n'), P)).status).toBe(403)
    as({ id: 'm1', role: 'manager' })
    expect((await importPost(json('POST', 'import', body), P)).status).toBe(201)
  })

  it('el body se valida en el server', async () => {
    const res = await importPost(json('POST', 'import', { locationId: String(loc._id), fileName: 'x', source: 'generic', rows: [row({ unit: 'bulto' })] }), P)
    expect(res.status).toBe(400)
  })
})
