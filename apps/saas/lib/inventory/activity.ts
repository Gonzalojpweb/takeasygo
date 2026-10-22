// ============================================================================
// Actividad de inventario — el ledger contado en lenguaje del restaurante
// ============================================================================
// Cada evento del ledger de una sede se traduce a "qué pasó, cuándo, quién y
// cuánto cambió". Es una LECTURA del ledger (no hay otra fuente): lo que se
// ve acá es exactamente lo que el sistema usó para calcular el stock.
//
// Montos en pesos (costo de una recepción, costo que viaja en una
// transferencia) solo para quien tiene `read`.
// ============================================================================

import mongoose from 'mongoose'
import InventoryLedger from '@/models/InventoryLedger'
import InventorySKU from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import User from '@/models/User'
import { canRoleUse, InventoryError, type InventoryContext } from './route'

export type ActivityKind =
  | 'sale'
  | 'sale_reverted'
  | 'receipt'
  | 'count'
  | 'waste'
  | 'adjustment'
  | 'transfer_out'
  | 'transfer_in'
  | 'production'

export interface ActivityLine {
  skuId: string
  skuName: string
  /** Cambio en la unidad del insumo (negativo = salió). null en un conteo. */
  delta: number | null
  /** Solo conteos: lo que se contó. */
  observed: number | null
  unit: string
}

export interface ActivityEntry {
  id: string
  kind: ActivityKind
  title: string
  detail: string | null
  occurredAt: string
  recordedAt: string
  /** Nombre de quien lo registró; "Automático" para ventas. */
  actor: string
  source: string
  storageName: string | null
  lines: ActivityLine[]
  /** Solo con `read`. @storedAs cents */
  unitCostCents?: number | null
  warnings: string[]
}

const TITLES: Record<ActivityKind, string> = {
  sale: 'Venta registrada',
  sale_reverted: 'Consumo revertido',
  receipt: 'Mercadería recibida',
  count: 'Conteo realizado',
  waste: 'Merma registrada',
  adjustment: 'Ajuste autorizado',
  transfer_out: 'Transferencia enviada',
  transfer_in: 'Transferencia recibida',
  production: 'Producción registrada',
}

const WASTE_REASONS: Record<string, string> = {
  expiration: 'vencimiento',
  damage: 'rotura o daño',
  preparation: 'preparación',
  contamination: 'contaminación',
  staff_meal: 'comida del personal',
  other: 'otro motivo',
}

const REVERT_REASONS: Record<string, string> = {
  cancelled: 'pedido cancelado',
  removed: 'plato quitado del pedido',
  quantity_changed: 'cantidad cambiada',
}

const KIND_TYPES: Record<ActivityKind, string> = {
  sale: 'SaleRecorded',
  sale_reverted: 'SaleRecorded',
  receipt: 'GoodsReceived',
  count: 'PhysicalCountObserved',
  waste: 'WasteRecorded',
  adjustment: 'AdjustmentApplied',
  transfer_out: 'TransferOut',
  transfer_in: 'TransferIn',
  production: 'ProductionTransformed',
}

/** Cursor estable "fechaISO_id": dos eventos con la misma hora no se saltean. */
function parseCursor(raw: string | null | undefined): { at: Date; id: mongoose.Types.ObjectId } | null {
  if (!raw) return null
  const [iso, id] = raw.split('_')
  const at = new Date(iso)
  if (Number.isNaN(at.getTime()) || !id || !mongoose.Types.ObjectId.isValid(id)) throw InventoryError.validation('Cursor inválido')
  return { at, id: new mongoose.Types.ObjectId(id) }
}

const SHOWN_TYPES = [
  'SaleRecorded',
  'GoodsReceived',
  'PhysicalCountObserved',
  'WasteRecorded',
  'AdjustmentApplied',
  'TransferOut',
  'TransferIn',
  'ProductionTransformed',
] as const

export async function loadActivity(
  ctx: InventoryContext,
  opts: { locationId: string; before?: string | null; limit: number; kinds?: ActivityKind[] | null },
): Promise<{ entries: ActivityEntry[]; nextBefore: string | null }> {
  if (!mongoose.Types.ObjectId.isValid(opts.locationId)) throw InventoryError.validation('locationId inválido')
  ctx.assertLocation(opts.locationId)
  const cursor = parseCursor(opts.before)
  const limit = Math.min(Math.max(opts.limit, 1), 100)
  const types = opts.kinds?.length
    ? SHOWN_TYPES.filter((t) => opts.kinds!.some((k) => KIND_TYPES[k] === t))
    : SHOWN_TYPES

  const events = await InventoryLedger.find({
    tenantId: ctx.tenantObjectId,
    locationId: new mongoose.Types.ObjectId(opts.locationId),
    eventType: { $in: types },
    ...(cursor
      ? { $or: [{ occurredAt: { $lt: cursor.at } }, { occurredAt: cursor.at, _id: { $lt: cursor.id } }] }
      : {}),
  })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
  const page = events.slice(0, limit)

  // Nombres: insumos (de eventos de insumo y de los consumos de ventas), depósitos y personas.
  const skuIds = new Set<string>()
  const storageIds = new Set<string>()
  const actorIds = new Set<string>()
  for (const e of page) {
    if (e.skuId) skuIds.add(String(e.skuId))
    if (e.storageLocationId) storageIds.add(String(e.storageLocationId))
    for (const c of (e.payload?.consumption ?? []) as Array<{ skuId: string }>) skuIds.add(String(c.skuId))
    if (e.actorId && mongoose.Types.ObjectId.isValid(e.actorId)) actorIds.add(e.actorId)
  }
  const [skus, storages, users] = await Promise.all([
    InventorySKU.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...skuIds].filter((id) => mongoose.Types.ObjectId.isValid(id)) } }).select('name').lean(),
    InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...storageIds] } }).select('name').lean(),
    // Solo usuarios del tenant (o superadmin): nunca nombres de otro comercio.
    User.find({ _id: { $in: [...actorIds] }, $or: [{ tenantId: ctx.tenantObjectId }, { role: 'superadmin' }] }).select('name role').lean(),
  ])
  const skuName = new Map(skus.map((s) => [String(s._id), s.name]))
  const storageName = new Map(storages.map((s) => [String(s._id), s.name]))
  const userName = new Map(users.map((u) => [String(u._id), u.role === 'superadmin' ? 'Soporte TakeasyGO' : u.name]))
  const money = canRoleUse(ctx.user.role, 'read')

  const entries: ActivityEntry[] = []
  for (const e of page) {
    const p = e.payload ?? {}
    const sku = e.skuId ? String(e.skuId) : ''
    const unit = p.unit ?? ''
    const line = (delta: number | null, observed: number | null = null): ActivityLine => ({
      skuId: sku, skuName: skuName.get(sku) ?? 'Insumo', delta, observed, unit,
    })
    let kind: ActivityKind
    let detail: string | null = null
    let lines: ActivityLine[] = []
    let cost: number | null | undefined

    switch (e.eventType) {
      case 'SaleRecorded': {
        kind = p.portions < 0 ? 'sale_reverted' : 'sale'
        const dish = `${Math.abs(p.portions)} × ${p.name}${p.variantName ? ` ${p.variantName}` : ''}`
        detail = kind === 'sale_reverted'
          ? `${dish}${p.orderNumber ? ` · pedido ${p.orderNumber}` : ''} · ${REVERT_REASONS[p.reason] ?? 'corrección'}`
          : `${dish}${p.orderNumber ? ` · pedido ${p.orderNumber}` : ''}${p.unmapped ? ' · no descontó insumos' : ''}`
        lines = ((p.consumption ?? []) as Array<{ skuId: string; quantity: number; unit: string }>).map((c) => ({
          skuId: String(c.skuId),
          skuName: skuName.get(String(c.skuId)) ?? 'Insumo',
          delta: -c.quantity,
          observed: null,
          unit: c.unit,
        }))
        break
      }
      case 'GoodsReceived':
        kind = 'receipt'
        detail = [p.declared ? `${p.declared.quantity} ${p.declared.unit}` : null, p.supplierName, p.invoiceRef ? `factura ${p.invoiceRef}` : null]
          .filter(Boolean)
          .join(' · ') || null
        lines = [line(p.quantity)]
        cost = p.unitCostCents ?? null
        break
      case 'PhysicalCountObserved':
        kind = 'count'
        detail = p.expectedAtRecord ? 'Recalibró la estimación' : 'Conteo inicial'
        lines = [line(null, p.observedQuantity)]
        break
      case 'WasteRecorded':
        kind = 'waste'
        detail = [WASTE_REASONS[p.reason] ?? p.reason, p.notes].filter(Boolean).join(' · ') || null
        lines = [line(-p.quantity)]
        break
      case 'AdjustmentApplied':
        kind = 'adjustment'
        detail = p.reason ?? null
        lines = [line(p.delta)]
        break
      case 'TransferOut':
        kind = 'transfer_out'
        detail = [p.toStorageLocationId ? `a ${storageName.get(String(p.toStorageLocationId)) ?? 'otro depósito'}` : null, p.reason].filter(Boolean).join(' · ') || null
        lines = [line(-p.quantity)]
        cost = p.unitCostCents ?? null
        break
      case 'TransferIn':
        kind = 'transfer_in'
        detail = p.fromStorageLocationId ? `desde ${storageName.get(String(p.fromStorageLocationId)) ?? 'otro depósito'}` : null
        lines = [line(p.quantity)]
        cost = p.unitCostCents ?? null
        break
      case 'ProductionTransformed':
        kind = 'production'
        detail = p.direction === 'output' ? 'Elaborado' : 'Insumo usado en la producción'
        lines = [line(p.direction === 'output' ? p.quantity : -p.quantity)]
        break
      default:
        continue
    }

    entries.push({
      id: String(e._id),
      kind,
      title: TITLES[kind],
      detail,
      occurredAt: e.occurredAt.toISOString(),
      recordedAt: e.recordedAt.toISOString(),
      actor: e.actorId ? (userName.get(e.actorId) ?? 'Usuario') : 'Automático',
      source: e.source,
      storageName: e.storageLocationId ? (storageName.get(String(e.storageLocationId)) ?? null) : null,
      lines,
      ...(money && cost !== undefined ? { unitCostCents: cost } : {}),
      warnings: Array.isArray(p.warnings) ? p.warnings : [],
    })
  }

  const last = page[page.length - 1]
  const nextBefore = events.length > limit && last ? `${last.occurredAt.toISOString()}_${String(last._id)}` : null
  return { entries: opts.kinds?.length ? entries.filter((x) => opts.kinds!.includes(x.kind)) : entries, nextBefore }
}
