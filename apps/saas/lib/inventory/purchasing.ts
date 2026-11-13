// ============================================================================
// purchasing.ts — Proveedores y órdenes de compra (F2)
// ============================================================================
// Por comercio. Quién hace qué (además del rol de la ruta):
//   · proveedores: ver (read), cargar y editar (manage).
//   · órdenes: crear, editar el borrador, enviar, cancelar y cerrar → manage,
//     y TODAS las sedes de la orden tienen que estar en tu alcance.
//   · recibir → capture (incluye jefe de cocina), solo en las sedes de tu
//     alcance. Escribe GoodsReceived (mismo formato que la recepción manual)
//     y actualiza último precio del insumo y del proveedor.
// Cambios de estado con control de concurrencia (updatedAt): si otro cambió
// la orden en el medio, 409.
// ============================================================================

import mongoose from 'mongoose'
import { z } from 'zod'
import Supplier, { type ISupplier } from '@/models/Supplier'
import PurchaseOrder, { type IPurchaseOrder, type IPoLine } from '@/models/PurchaseOrder'
import InventorySKU from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { appendEvents } from './projector'
import { canRoleUse, InventoryError, type InventoryContext } from './route'
import {
  canPoTransition,
  lineQuantity,
  orderTotalCents,
  round3,
  statusAfterReceipt,
  supplierMessage,
  supplierNameKey,
  whatsappLink,
  type PoAction,
  type PoStatus,
} from './purchasing-rules'

const objectIdStr = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Identificador inválido')
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null))
const oid = (v: unknown) => new mongoose.Types.ObjectId(String(v))
const inScope = (ctx: InventoryContext, id: unknown) => !ctx.scopedLocationIds || ctx.scopedLocationIds.includes(String(id))
const stepOf = (ctx: InventoryContext) => ({ by: mongoose.Types.ObjectId.isValid(ctx.user.id) ? oid(ctx.user.id) : null, at: new Date() })

function requireManage(ctx: InventoryContext) {
  if (!canRoleUse(ctx.user.role, 'manage')) throw InventoryError.forbidden('Solo un encargado, administrador o jefe de operaciones maneja las compras')
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export const supplierInputSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(120),
  taxId: optText(20),
  contactName: optText(120),
  phone: optText(40),
  email: z.string().trim().email('Email inválido').max(160).nullish().or(z.literal('')).transform((v) => (v ? v : null)),
  paymentTerms: optText(200),
  leadTimeDays: z.number().int().min(0).max(365).nullish().transform((v) => (v === undefined ? null : v)),
  notes: optText(500),
  skuIds: z.array(objectIdStr).max(300).optional(),
})
export const supplierPatchSchema = supplierInputSchema.partial().extend({ isActive: z.boolean().optional() })

async function assertSkus(ctx: InventoryContext, ids: string[]) {
  if (ids.length === 0) return
  const n = await InventorySKU.countDocuments({ tenantId: ctx.tenantObjectId, _id: { $in: ids } })
  if (n !== new Set(ids).size) throw InventoryError.validation('Hay un insumo que no existe')
}

export async function listSuppliers(ctx: InventoryContext, includeInactive = false) {
  const docs = await Supplier.find({ tenantId: ctx.tenantObjectId, ...(includeInactive ? {} : { isActive: true }) }).sort({ name: 1 }).lean<ISupplier[]>()
  return docs.map(supplierView)
}

export function supplierView(s: ISupplier) {
  return {
    _id: String(s._id),
    name: s.name,
    taxId: s.taxId,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    paymentTerms: s.paymentTerms,
    leadTimeDays: s.leadTimeDays,
    notes: s.notes,
    isActive: s.isActive,
    products: (s.products ?? []).map((p) => ({ skuId: String(p.skuId), code: p.code, lastUnitCostCents: p.lastUnitCostCents, lastPurchasedAt: p.lastPurchasedAt ? new Date(p.lastPurchasedAt).toISOString() : null })),
  }
}

export async function createSupplier(ctx: InventoryContext, input: z.infer<typeof supplierInputSchema>) {
  requireManage(ctx)
  const skuIds = [...new Set(input.skuIds ?? [])]
  await assertSkus(ctx, skuIds)
  try {
    const doc = await Supplier.create({
      tenantId: ctx.tenantObjectId,
      name: input.name,
      nameKey: supplierNameKey(input.name),
      taxId: input.taxId, contactName: input.contactName, phone: input.phone, email: input.email,
      paymentTerms: input.paymentTerms, leadTimeDays: input.leadTimeDays, notes: input.notes,
      products: skuIds.map((id) => ({ skuId: oid(id), code: null, lastUnitCostCents: null, lastPurchasedAt: null })),
    })
    return supplierView(doc.toObject() as ISupplier)
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw InventoryError.conflict('Ya hay un proveedor con ese nombre')
    throw err
  }
}

export async function updateSupplier(ctx: InventoryContext, supplierId: string, patch: z.infer<typeof supplierPatchSchema>) {
  requireManage(ctx)
  if (!mongoose.Types.ObjectId.isValid(supplierId)) throw InventoryError.notFound('Proveedor no encontrado')
  const current = await Supplier.findOne({ _id: supplierId, tenantId: ctx.tenantObjectId }).lean<ISupplier>()
  if (!current) throw InventoryError.notFound('Proveedor no encontrado')
  const set: Record<string, unknown> = {}
  for (const k of ['taxId', 'contactName', 'phone', 'email', 'paymentTerms', 'leadTimeDays', 'notes', 'isActive'] as const) {
    if (patch[k] !== undefined) set[k] = patch[k]
  }
  if (patch.name !== undefined) { set.name = patch.name; set.nameKey = supplierNameKey(patch.name) }
  if (patch.skuIds !== undefined) {
    const ids = [...new Set(patch.skuIds)]
    await assertSkus(ctx, ids)
    // Conserva precio y código de los que ya estaban.
    const prev = new Map((current.products ?? []).map((p) => [String(p.skuId), p]))
    set.products = ids.map((id) => prev.get(id) ?? { skuId: oid(id), code: null, lastUnitCostCents: null, lastPurchasedAt: null })
  }
  try {
    const doc = await Supplier.findOneAndUpdate({ _id: supplierId, tenantId: ctx.tenantObjectId }, { $set: set }, { new: true }).lean<ISupplier>()
    return supplierView(doc!)
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw InventoryError.conflict('Ya hay un proveedor con ese nombre')
    throw err
  }
}

/**
 * Crea proveedores a partir del texto «proveedor» que ya tienen los insumos
 * (recepción manual). No duplica los que ya existen; les suma los insumos.
 */
export async function importSuppliersFromSkus(ctx: InventoryContext) {
  requireManage(ctx)
  const skus = await InventorySKU.find({ tenantId: ctx.tenantObjectId, supplierName: { $nin: [null, ''] } }).select('supplierName lastUnitCostCents').lean<Array<{ _id: mongoose.Types.ObjectId; supplierName: string; lastUnitCostCents?: number }>>()
  const groups = new Map<string, { name: string; skus: typeof skus }>()
  for (const s of skus) {
    const key = supplierNameKey(s.supplierName)
    if (!key) continue
    const g = groups.get(key) ?? { name: s.supplierName.trim().slice(0, 120), skus: [] }
    g.skus.push(s)
    groups.set(key, g)
  }
  let created = 0
  let updated = 0
  for (const [key, g] of groups) {
    const existing = await Supplier.findOne({ tenantId: ctx.tenantObjectId, nameKey: key }).lean<ISupplier>()
    if (!existing) {
      await Supplier.create({
        tenantId: ctx.tenantObjectId, name: g.name, nameKey: key,
        products: g.skus.map((s) => ({ skuId: s._id, code: null, lastUnitCostCents: s.lastUnitCostCents || null, lastPurchasedAt: null })),
      }).catch((err) => { if ((err as { code?: number }).code !== 11000) throw err })
      created++
    } else {
      const have = new Set((existing.products ?? []).map((p) => String(p.skuId)))
      const add = g.skus.filter((s) => !have.has(String(s._id)))
      if (add.length) {
        await Supplier.updateOne({ _id: existing._id }, { $push: { products: { $each: add.map((s) => ({ skuId: s._id, code: null, lastUnitCostCents: s.lastUnitCostCents || null, lastPurchasedAt: null })) } } })
        updated++
      }
    }
  }
  return { created, updated }
}

// ---------------------------------------------------------------------------
// Órdenes de compra
// ---------------------------------------------------------------------------

const allocationInput = z.object({ locationId: objectIdStr, storageLocationId: objectIdStr.optional(), quantity: z.number().finite().min(0).max(1_000_000) })
const lineInput = z.object({
  skuId: objectIdStr,
  unitCostCents: z.number().int().min(0).max(1_000_000_000).nullish(),
  allocations: z.array(allocationInput).min(1).max(30),
})
const orderFields = {
  lines: z.array(lineInput).min(1).max(80),
  note: optText(500),
  expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
}
export const createOrderSchema = z.object({ supplierId: objectIdStr, ...orderFields })

export const poActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), supplierId: objectIdStr.optional(), ...orderFields }),
  z.object({ action: z.literal('send') }),
  z.object({
    action: z.literal('receive'),
    /** Id de la entrega (lo genera el cliente): reintentar no duplica. */
    receiptId: z.string().regex(/^[\w-]{8,64}$/),
    invoiceRef: optText(80),
    items: z.array(z.object({ skuId: objectIdStr, storageLocationId: objectIdStr, quantity: z.number().finite().min(0).max(1_000_000), unitCostCents: z.number().int().min(0).max(1_000_000_000).nullish() })).min(1).max(400),
  }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('cancel') }),
])

/** Valida y arma las líneas: insumos y sedes del comercio, sedes en tu alcance, depósito de la sede. */
async function buildLines(ctx: InventoryContext, input: z.infer<typeof lineInput>[]): Promise<IPoLine[]> {
  const skuIds = input.map((l) => l.skuId)
  if (new Set(skuIds).size !== skuIds.length) throw InventoryError.validation('Hay un insumo repetido en la orden')
  const locIds = [...new Set(input.flatMap((l) => l.allocations.map((a) => a.locationId)))]
  for (const id of locIds) ctx.assertLocation(id)
  const [skus, locs, storages] = await Promise.all([
    InventorySKU.find({ tenantId: ctx.tenantObjectId, _id: { $in: skuIds }, isActive: { $ne: false } }).select('canonicalUnit').lean(),
    Location.find({ tenantId: ctx.tenantObjectId, _id: { $in: locIds } }).select('_id').lean(),
    InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, locationId: { $in: locIds }, isActive: { $ne: false } }).select('locationId isDefaultConsumption').lean(),
  ])
  if (skus.length !== skuIds.length) throw InventoryError.validation('Hay un insumo que no existe o está desactivado')
  if (locs.length !== locIds.length) throw InventoryError.notFound('Sede no encontrada')
  const unit = new Map(skus.map((s) => [String(s._id), s.canonicalUnit]))
  const storageLoc = new Map(storages.map((s) => [String(s._id), String(s.locationId)]))
  const defaultStorage = new Map(storages.filter((s) => s.isDefaultConsumption).map((s) => [String(s.locationId), String(s._id)]))

  return input.map((l) => {
    const seen = new Set<string>()
    const allocations = l.allocations.map((a) => {
      const storageId = a.storageLocationId ?? defaultStorage.get(a.locationId)
      if (!storageId) throw InventoryError.validation('Una sede de la orden no tiene depósito: elegí dónde entra')
      if (storageLoc.get(storageId) !== a.locationId) throw InventoryError.validation('El depósito no es de esa sede')
      if (seen.has(storageId)) throw InventoryError.validation('Hay un depósito repetido en la misma línea')
      seen.add(storageId)
      return { locationId: oid(a.locationId), storageLocationId: oid(storageId), quantity: round3(a.quantity), received: 0 }
    })
    if (!allocations.some((a) => a.quantity > 0)) throw InventoryError.validation('Cada insumo tiene que tener una cantidad')
    return { skuId: oid(l.skuId), unit: unit.get(l.skuId)!, unitCostCents: l.unitCostCents ?? null, allocations }
  })
}

async function requireSupplier(ctx: InventoryContext, supplierId: string) {
  const s = await Supplier.findOne({ _id: supplierId, tenantId: ctx.tenantObjectId, isActive: true }).select('_id').lean()
  if (!s) throw InventoryError.validation('Proveedor no encontrado o desactivado')
}

const toDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00-03:00`) : null)

export async function createOrder(ctx: InventoryContext, input: z.infer<typeof createOrderSchema>) {
  requireManage(ctx)
  await requireSupplier(ctx, input.supplierId)
  const lines = await buildLines(ctx, input.lines)
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await PurchaseOrder.findOne({ tenantId: ctx.tenantObjectId }).sort({ number: -1 }).select('number').lean<{ number: number }>()
    try {
      const doc = await PurchaseOrder.create({
        tenantId: ctx.tenantObjectId,
        number: (last?.number ?? 0) + 1,
        supplierId: oid(input.supplierId),
        status: 'draft',
        lines,
        note: input.note,
        expectedAt: toDate(input.expectedAt),
        created: stepOf(ctx),
      })
      return doc.toObject() as IPurchaseOrder
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err
    }
  }
  throw InventoryError.conflict('No se pudo numerar la orden; probá de nuevo')
}

async function loadOrder(ctx: InventoryContext, orderId: string) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw InventoryError.notFound('Orden no encontrada')
  const o = await PurchaseOrder.findOne({ _id: orderId, tenantId: ctx.tenantObjectId }).lean<IPurchaseOrder>()
  if (!o || !orderLocationIds(o).some((id) => inScope(ctx, id))) throw InventoryError.notFound('Orden no encontrada')
  return o
}

function orderLocationIds(o: Pick<IPurchaseOrder, 'lines'>): string[] {
  return [...new Set(o.lines.flatMap((l) => l.allocations.map((a) => String(a.locationId))))]
}

/** Guarda solo si nadie la cambió desde que se leyó. */
async function save(ctx: InventoryContext, o: IPurchaseOrder, update: Record<string, unknown>) {
  const doc = await PurchaseOrder.findOneAndUpdate({ _id: o._id, tenantId: ctx.tenantObjectId, updatedAt: o.updatedAt }, update, { new: true }).lean<IPurchaseOrder>()
  if (!doc) throw InventoryError.conflict('Alguien ya cambió esta orden. Actualizá para ver cómo quedó.')
  return doc
}

export async function applyPoAction(ctx: InventoryContext, orderId: string, input: z.infer<typeof poActionSchema>) {
  const o = await loadOrder(ctx, orderId)
  if (!canPoTransition(o.status, input.action)) throw InventoryError.conflict(`La orden está ${STATUS_TEXT[o.status]}: no se puede ${ACTION_TEXT[input.action]}`)

  if (input.action !== 'receive') {
    requireManage(ctx)
    for (const id of orderLocationIds(o)) ctx.assertLocation(id)
  }

  switch (input.action) {
    case 'update': {
      if (input.supplierId) await requireSupplier(ctx, input.supplierId)
      const lines = await buildLines(ctx, input.lines)
      return save(ctx, o, { $set: { lines, note: input.note, expectedAt: toDate(input.expectedAt), ...(input.supplierId ? { supplierId: oid(input.supplierId) } : {}) } })
    }
    case 'send':
      return save(ctx, o, { $set: { status: 'sent', sent: stepOf(ctx) } })
    case 'cancel':
      if (o.receipts.length > 0) throw InventoryError.conflict('Ya se recibió mercadería: cerrala en lugar de cancelarla')
      return save(ctx, o, { $set: { status: 'cancelled', cancelled: stepOf(ctx) } })
    case 'close':
      return save(ctx, o, { $set: { status: 'received', closed: stepOf(ctx), closedShort: true } })
    case 'receive':
      return receiveOrder(ctx, o, input)
  }
}

async function receiveOrder(ctx: InventoryContext, o: IPurchaseOrder, input: Extract<z.infer<typeof poActionSchema>, { action: 'receive' }>) {
  // Misma entrega reintentada: no hace nada.
  if (o.receipts.some((r) => r.receiptId === input.receiptId)) return o

  const lines = o.lines.map((l) => ({ ...l, allocations: l.allocations.map((a) => ({ ...a })) }))
  const items: IPurchaseOrder['receipts'][number]['items'] = []
  for (const it of input.items) {
    if (it.quantity <= 0) continue
    const line = lines.find((l) => String(l.skuId) === it.skuId)
    const alloc = line?.allocations.find((a) => String(a.storageLocationId) === it.storageLocationId)
    if (!line || !alloc) throw InventoryError.validation('Hay un insumo o depósito que no está en la orden')
    if (!inScope(ctx, alloc.locationId)) throw InventoryError.notFound('Orden no encontrada')
    alloc.received = round3(alloc.received + it.quantity)
    items.push({ skuId: line.skuId, storageLocationId: alloc.storageLocationId, quantity: round3(it.quantity), unitCostCents: it.unitCostCents ?? line.unitCostCents ?? null })
  }
  if (items.length === 0) throw InventoryError.validation('Indicá cuánto llegó de al menos un insumo')

  const receipt = { receiptId: input.receiptId, at: new Date(), by: stepOf(ctx).by, invoiceRef: input.invoiceRef, items }
  const status: PoStatus = statusAfterReceipt(lines)
  const saved = await save(ctx, o, { $set: { lines, status, ...(status === 'received' ? { closed: stepOf(ctx) } : {}) }, $push: { receipts: receipt } })

  const supplier = await Supplier.findOne({ _id: o.supplierId, tenantId: ctx.tenantObjectId }).select('name').lean<{ name: string }>()
  const locBy = new Map(lines.flatMap((l) => l.allocations.map((a) => [String(a.storageLocationId), a.locationId])))
  try {
    await appendEvents(items.map((it) => ({
      eventId: `po:${o._id}:${input.receiptId}:${it.skuId}:${it.storageLocationId}`,
      tenantId: ctx.tenantObjectId,
      locationId: locBy.get(String(it.storageLocationId))!,
      skuId: it.skuId,
      storageLocationId: it.storageLocationId,
      eventType: 'GoodsReceived' as const,
      occurredAt: receipt.at,
      source: 'manual' as const,
      actorId: ctx.user.id,
      correlationId: `po:${o._id}`,
      payload: {
        quantity: it.quantity,
        unit: lines.find((l) => String(l.skuId) === String(it.skuId))!.unit,
        unitCostCents: it.unitCostCents,
        supplierName: supplier?.name ?? null,
        invoiceRef: input.invoiceRef,
        purchaseOrderNumber: o.number,
        declared: { quantity: it.quantity, unit: lines.find((l) => String(l.skuId) === String(it.skuId))!.unit },
      },
    })))
  } catch (err) {
    // Vuelve atrás la orden: la entrega se puede reintentar con el mismo id.
    await PurchaseOrder.updateOne({ _id: o._id, tenantId: ctx.tenantObjectId }, { $set: { lines: o.lines, status: o.status, closed: o.closed }, $pull: { receipts: { receiptId: input.receiptId } } })
    throw err
  }

  // Último precio del insumo y del proveedor (y el nombre del proveedor en el insumo).
  const now = new Date()
  for (const it of items) {
    const set: Record<string, unknown> = { supplierName: supplier?.name ?? null }
    if (it.unitCostCents !== null) set.lastUnitCostCents = it.unitCostCents
    await InventorySKU.updateOne({ _id: it.skuId, tenantId: ctx.tenantObjectId }, { $set: set })
    const updatedProduct = await Supplier.updateOne(
      { _id: o.supplierId, tenantId: ctx.tenantObjectId, 'products.skuId': it.skuId },
      { $set: { 'products.$.lastPurchasedAt': now, ...(it.unitCostCents !== null ? { 'products.$.lastUnitCostCents': it.unitCostCents } : {}) } },
    )
    if (updatedProduct.matchedCount === 0) {
      await Supplier.updateOne({ _id: o.supplierId, tenantId: ctx.tenantObjectId }, { $push: { products: { skuId: it.skuId, code: null, lastUnitCostCents: it.unitCostCents, lastPurchasedAt: now } } })
    }
  }
  return saved
}

const STATUS_TEXT: Record<PoStatus, string> = { draft: 'en borrador', sent: 'enviada', partial: 'recibida en parte', received: 'recibida', cancelled: 'cancelada' }
const ACTION_TEXT: Record<PoAction, string> = { update: 'editar', send: 'enviar', receive: 'recibir', close: 'cerrar', cancel: 'cancelar' }

/** Qué puede hacer este usuario con esta orden ahora. */
export function allowedPoActions(o: { status: PoStatus; locationIds: string[]; hasReceipts: boolean }, user: { role: string; scopedLocationIds: string[] | null }): PoAction[] {
  const inS = (id: string) => !user.scopedLocationIds || user.scopedLocationIds.includes(id)
  const manageAll = canRoleUse(user.role, 'manage') && o.locationIds.every(inS)
  const out: PoAction[] = []
  if (manageAll && canPoTransition(o.status, 'update')) out.push('update')
  if (manageAll && canPoTransition(o.status, 'send')) out.push('send')
  if (canRoleUse(user.role, 'capture') && canPoTransition(o.status, 'receive') && o.locationIds.some(inS)) out.push('receive')
  if (manageAll && canPoTransition(o.status, 'close')) out.push('close')
  if (manageAll && canPoTransition(o.status, 'cancel') && !o.hasReceipts) out.push('cancel')
  return out
}

export async function toPoViews(ctx: InventoryContext, docs: IPurchaseOrder[]) {
  const skuIds = new Set<string>(), locIds = new Set<string>(), storageIds = new Set<string>(), supplierIds = new Set<string>(), userIds = new Set<string>()
  for (const d of docs) {
    supplierIds.add(String(d.supplierId))
    for (const l of d.lines) {
      skuIds.add(String(l.skuId))
      for (const a of l.allocations) { locIds.add(String(a.locationId)); storageIds.add(String(a.storageLocationId)) }
    }
    for (const r of d.receipts) if (r.by) userIds.add(String(r.by))
  }
  const [skus, locs, storages, suppliers, users, tenant] = await Promise.all([
    InventorySKU.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...skuIds] } }).select('name').lean(),
    Location.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...locIds] } }).select('name').lean(),
    InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...storageIds] } }).select('name').lean(),
    Supplier.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...supplierIds] } }).select('name phone contactName').lean<Array<{ _id: unknown; name: string; phone: string | null; contactName: string | null }>>(),
    User.find({ _id: { $in: [...userIds] } }).select('name').lean(),
    Tenant.findById(ctx.tenantObjectId).select('name').lean<{ name?: string }>(),
  ])
  const names = (list: Array<{ _id: unknown; name?: string }>) => new Map(list.map((x) => [String(x._id), x.name ?? '—']))
  const skuName = names(skus), locName = names(locs), storageName = names(storages), userName = names(users as never)
  const supplierBy = new Map(suppliers.map((s) => [String(s._id), s]))

  return docs.map((d) => {
    const supplier = supplierBy.get(String(d.supplierId))
    const lines = d.lines.map((l) => ({
      skuId: String(l.skuId),
      name: skuName.get(String(l.skuId)) ?? '—',
      unit: l.unit,
      unitCostCents: l.unitCostCents,
      ...lineQuantity(l),
      allocations: l.allocations.map((a) => ({
        locationId: String(a.locationId),
        locationName: locName.get(String(a.locationId)) ?? '—',
        storageLocationId: String(a.storageLocationId),
        storageName: storageName.get(String(a.storageLocationId)) ?? '—',
        quantity: a.quantity,
        received: a.received,
      })),
    }))
    const message = supplierMessage({
      businessName: tenant?.name ?? ctx.tenantSlug,
      number: d.number,
      supplierContact: supplier?.contactName ?? null,
      expectedAt: d.expectedAt ? new Date(d.expectedAt) : null,
      note: d.note,
      lines: lines.map((l) => ({ name: l.name, unit: l.unit, allocations: l.allocations.map((a) => ({ locationName: a.locationName, quantity: a.quantity })) })),
    })
    const locationIds = orderLocationIds(d)
    return {
      _id: String(d._id),
      number: d.number,
      status: d.status,
      supplier: { _id: String(d.supplierId), name: supplier?.name ?? '—', phone: supplier?.phone ?? null },
      lines,
      note: d.note,
      expectedAt: d.expectedAt ? new Date(d.expectedAt).toISOString().slice(0, 10) : null,
      ...orderTotalCents(d.lines),
      receivedCostCents: Math.round(d.receipts.reduce((s, r) => s + r.items.reduce((x, it) => x + it.quantity * (it.unitCostCents ?? 0), 0), 0)),
      receipts: d.receipts.map((r) => ({ receiptId: r.receiptId, at: new Date(r.at).toISOString(), by: r.by ? userName.get(String(r.by)) ?? null : null, invoiceRef: r.invoiceRef, items: r.items.length })),
      closedShort: d.closedShort,
      createdAt: new Date(d.created.at).toISOString(),
      sentAt: d.sent ? new Date(d.sent.at).toISOString() : null,
      message,
      whatsapp: whatsappLink(supplier?.phone ?? null, message),
      actions: allowedPoActions({ status: d.status, locationIds, hasReceipts: d.receipts.length > 0 }, { role: ctx.user.role, scopedLocationIds: ctx.scopedLocationIds }),
      updatedAt: new Date(d.updatedAt).toISOString(),
    }
  })
}

export type PurchaseOrderView = Awaited<ReturnType<typeof toPoViews>>[number]

export async function listOrders(ctx: InventoryContext, opts: { open?: boolean; supplierId?: string | null }) {
  const filter: Record<string, unknown> = { tenantId: ctx.tenantObjectId }
  if (ctx.scopedLocationIds) filter['lines.allocations.locationId'] = { $in: ctx.scopedLocationIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map(oid) }
  if (opts.open !== undefined) filter.status = opts.open ? { $in: ['draft', 'sent', 'partial'] } : { $in: ['received', 'cancelled'] }
  if (opts.supplierId && mongoose.Types.ObjectId.isValid(opts.supplierId)) filter.supplierId = oid(opts.supplierId)
  const docs = await PurchaseOrder.find(filter).sort({ updatedAt: -1 }).limit(100).lean<IPurchaseOrder[]>()
  return toPoViews(ctx, docs)
}
