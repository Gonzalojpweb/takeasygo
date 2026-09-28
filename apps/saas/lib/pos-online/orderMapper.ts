import mongoose from 'mongoose'
import type {
  OrderItem as PosOrderItem,
  OrderStatus as PosOrderStatus,
  PaymentMethod,
} from '@takeasygo/types'
import { calculateOrderTotal, validateOrderItems } from '@takeasygo/business'
import { generateOrderNumber } from '@/lib/orderNumber'
import { PosError } from './errors'

// ============================================================================
// Mapper POS (wire contract) ⇄ SaaS (Order document)
// ============================================================================
// Invariantes del contrato (docs/POS-ONLINE-PLAN.md §1.3):
//
//  · El id del POS (`crypto.randomUUID()`) se guarda en `posId`; `_id` sigue
//    siendo ObjectId. El contrato expuesto al POS usa `id = posId`.
//  · `posId` es además la Idempotency-Key.
//  · DINERO EN CENTAVOS EN AMBOS LADOS — no hay conversión. (El SaaS documenta
//    `@storedAs cents` y el POS usa toPesos() solo para mostrar.)
//  · El SERVER recalcula totales. Si el cliente manda un total que no cierra,
//    se rechaza en vez de guardar el número que mandó.
//
// Campos del POS que NO se persisten en el server (documentado, no es una
// pérdida silenciosa):
//  · `customerId` — hoy nunca se setea (useOrders.createOrder no lo pasa).
//    Si empieza a usarse, hay que agregarle columna acá.
// ============================================================================

/** Estado que el POS puede mandar (subconjunto del enum del server). */
export type PosOrderStatusValue = PosOrderStatus

export interface PosOrderItemInput {
  productId: string
  name: string
  quantity: number
  /** Precio base unitario en centavos (sin modificadores). */
  unitPrice: number
  /** (unitPrice + sum(modifiers.price)) * quantity, en centavos. */
  total: number
  modifiers?: { name: string; price: number }[]
  /** Nota de cocina. El POS manda string, nunca null. */
  notes?: string
}

export interface PosOrderInput {
  /** posId — UUID generado por el POS. Obligatorio. */
  id: string
  /** posId de la mesa (no _id). */
  tableId?: string | null
  menuVersion?: number
  notes?: string | null
  status?: PosOrderStatusValue
  paymentMethod?: PaymentMethod
  items: PosOrderItemInput[]
}

export interface PosOrderWriteContext {
  /** ObjectId string del tenant (ya resuelto y autorizado por la ruta). */
  tenantId: string
  /** ObjectId string de la sede. */
  locationId: string
  /** Slug del tenant — define el prefijo del orderNumber. */
  tenantSlug: string
}

/**
 * Shape listo para `new Order(doc)` / `Order.create(doc)`.
 * Se devuelve un objeto plano a propósito: Mongoose es quien valida el enum,
 * los min y los required al persistir.
 */
export interface SaasOrderDraft {
  posId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderNumber: string
  orderMode: 'dine-in' | 'takeaway'
  status: PosOrderStatusValue
  source: 'pos'
  items: SaasOrderItemDraft[]
  subtotal: number
  total: number
  discountAmount: number
  menuVersion: number
  posTableId: string | null
  notes: string
  customer: { name: string; phone: string; email: string }
  payment: {
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    method: PaymentMethod
    baseTotal: number
    surchargePercent: number
    surchargeAmount: number
    platformFeeAmount: number
  }
}

export interface SaasOrderItemDraft {
  menuItemId: mongoose.Types.ObjectId | null
  itemType: 'menuItem'
  categoryName: string
  name: string
  description: string
  shortDescription: string
  basePrice: number
  extraPrice: number
  price: number
  quantity: number
  subtotal: number
  customizations: {
    groupName: string
    selectedOptions: { name: string; extraPrice: number }[]
  }[]
  notes: string | null
}

/** Nombre usado cuando el POS no informa comensal (el schema exige no vacío). */
const DEFAULT_CUSTOMER_NAME = 'Consumidor final'

/**
 * Recalcula los totales de la orden a partir de items ya maquetados.
 * Se usa en toda mutación de items (agregar/quitar/cantidad): el server es
 * quien decide el importe, nunca el que manda el cliente.
 */
export function recomputeOrderTotals(items: SaasOrderItemDraft[]): {
  subtotal: number
  total: number
  baseTotal: number
} {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
  return { subtotal, total: subtotal, baseTotal: subtotal }
}

/** Grupo único donde el POS vuelca sus modifiers planos. */
const MODIFIERS_GROUP_NAME = 'Modificadores'

function assertPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw PosError.validation(`${field} debe ser un entero >= 0`, `got: ${String(value)}`)
  }
  return value
}

/** Convierte el productId del POS en ObjectId, o null si no lo es. */
function toMenuItemId(productId: string): mongoose.Types.ObjectId | null {
  if (!productId) return null
  return mongoose.isValidObjectId(productId) ? new mongoose.Types.ObjectId(productId) : null
}

function sumModifiers(modifiers: { name: string; price: number }[] | undefined): number {
  if (!modifiers?.length) return 0
  return modifiers.reduce((sum, m) => sum + assertPositiveInteger(m.price, 'modifier.price'), 0)
}

// ============================================================================
// POS → SaaS
// ============================================================================

/**
 * Mapea un item del POS al item del SaaS, RECALCULANDO precios.
 *
 * Relación:
 *   basePrice  = unitPrice                       (precio de carta, centavos)
 *   extraPrice = Σ modifiers.price               (por unidad)
 *   price      = basePrice + extraPrice
 *   subtotal   = price * quantity                ← debe ser igual al `total`
 *                                                       que mandó el POS
 */
export function toSaasOrderItem(item: PosOrderItemInput): SaasOrderItemDraft {
  if (!item || typeof item.name !== 'string' || item.name.trim().length === 0) {
    throw PosError.validation('Item sin nombre')
  }

  const quantity = assertPositiveInteger(item.quantity, `items[${item.name}].quantity`)
  if (quantity < 1) {
    throw PosError.validation(`Item "${item.name}" con quantity < 1`, `got: ${quantity}`)
  }

  const basePrice = assertPositiveInteger(item.unitPrice, `items[${item.name}].unitPrice`)
  const extraPrice = sumModifiers(item.modifiers)
  const price = basePrice + extraPrice
  const subtotal = price * quantity

  const clientTotal = assertPositiveInteger(item.total, `items[${item.name}].total`)
  if (clientTotal !== subtotal) {
    // El server no "arregla" el total en silencio: un descuadre es o un cliente
    // desactualizado o un intento de alterar el importe. Ambos merecen un 400.
    throw PosError.validation(
      `Item "${item.name}": total del cliente no coincide con el recalculado`,
      `client=${clientTotal} computed=${subtotal} ((${basePrice}+${extraPrice})*${quantity})`
    )
  }

  const modifiers = item.modifiers ?? []

  return {
    menuItemId: toMenuItemId(item.productId),
    itemType: 'menuItem',
    categoryName: '',
    name: item.name,
    description: '',
    shortDescription: '',
    basePrice,
    extraPrice,
    price,
    quantity,
    subtotal,
    customizations:
      modifiers.length > 0
        ? [
            {
              groupName: MODIFIERS_GROUP_NAME,
              selectedOptions: modifiers.map((m) => ({
                name: m.name,
                extraPrice: assertPositiveInteger(m.price, 'modifier.price'),
              })),
            },
          ]
        : [],
    notes: item.notes ?? null,
  }
}

/**
 * Construye el documento SaaS a partir del contrato POS.
 * Lanza `PosError.validation` ante cualquier descuadre.
 */
export function toSaasOrder(input: PosOrderInput, ctx: PosOrderWriteContext): SaasOrderDraft {
  if (!input?.id || typeof input.id !== 'string') {
    throw PosError.validation('Falta id (posId) de la orden')
  }
  if (!mongoose.isValidObjectId(ctx.tenantId) || !mongoose.isValidObjectId(ctx.locationId)) {
    throw PosError.validation('tenantId/locationId inválidos')
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw PosError.validation('La orden debe tener al menos un item')
  }

  const validation = validateOrderItems(input.items)
  if (!validation.valid) {
    throw PosError.validation('Items inválidos', validation.errors.join('; '))
  }

  const items = input.items.map(toSaasOrderItem)
  const subtotal = calculateOrderTotal(input.items)

  // Verificación cruzada: la suma de los subtotales recalculados debe coincidir
  // con calculateOrderTotal (mismo código que usa el POS client-side).
  const recomputedSubtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  if (recomputedSubtotal !== subtotal) {
    throw PosError.validation(
      'Subtotal recalculado no coincide con la suma de items',
      `sum(items)=${recomputedSubtotal} calculateOrderTotal=${subtotal}`
    )
  }

  const tableId = input.tableId ?? null

  return {
    posId: input.id,
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    locationId: new mongoose.Types.ObjectId(ctx.locationId),
    orderNumber: generateOrderNumber(ctx.tenantSlug),
    // Con mesa es salón; sin mesa es takeaway. El POS no manda el modo.
    orderMode: tableId ? 'dine-in' : 'takeaway',
    status: input.status ?? 'pending',
    source: 'pos',
    items,
    subtotal,
    total: subtotal,
    discountAmount: 0,
    menuVersion: input.menuVersion ?? 1,
    posTableId: tableId,
    notes: input.notes ?? '',
    customer: {
      name: DEFAULT_CUSTOMER_NAME,
      phone: '',
      email: '',
    },
    payment: {
      status: 'pending',
      method: input.paymentMethod ?? 'cash',
      baseTotal: subtotal,
      surchargePercent: 0,
      surchargeAmount: 0,
      platformFeeAmount: 0,
    },
  }
}

// ============================================================================
// SaaS → POS (read model: lo que el POS escribe en Dexie)
// ============================================================================

/** Contrato mínimo que el mapper garantiza al POS. */
export interface PosOrderContract {
  id: string
  tenantId: string
  source: string
  status: string
  tableId?: string
  items: PosOrderItem[]
  total: number
  menuVersion: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

function toPosModifiers(customizations: SaasOrderItemDraft['customizations']): { name: string; price: number }[] {
  const out: { name: string; price: number }[] = []
  for (const group of customizations ?? []) {
    for (const opt of group.selectedOptions ?? []) {
      out.push({ name: opt.name, price: opt.extraPrice })
    }
  }
  return out
}

/**
 * Documento SaaS → contrato POS.
 *
 * `id = posId`: el POS reconoce sus propias órdenes por su UUID, nunca por
 * el ObjectId de Mongo. Los `null` opcionales se convierten en `undefined`
 * para que el registro de Dexie respete el tipo del POS.
 */
export function toPosOrder(doc: {
  posId?: string | null
  tenantId: mongoose.Types.ObjectId | string
  source?: string | null
  status: string
  posTableId?: string | null
  items: SaasOrderItemDraft[]
  total: number
  menuVersion?: number
  notes?: string | null
  createdAt: Date
  updatedAt: Date
}): PosOrderContract {
  if (!doc.posId) {
    throw PosError.internal('Orden sin posId en el read model', 'source o posId ausente')
  }

  return {
    id: doc.posId,
    tenantId: doc.tenantId.toString(),
    source: doc.source ?? 'pos',
    status: doc.status,
    tableId: doc.posTableId ?? undefined,
    items: (doc.items ?? []).map((i) => ({
      productId: i.menuItemId?.toString() ?? '',
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.basePrice,
      total: i.subtotal,
      modifiers: toPosModifiers(i.customizations),
      notes: i.notes ?? undefined,
    })),
    total: doc.total,
    menuVersion: doc.menuVersion ?? 1,
    notes: doc.notes || undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
