import mongoose, { Schema, type Document } from 'mongoose'

// ============================================================================
// PosDiscountEvent — historial de descuentos y ajustes del POS (append-only)
// ============================================================================
// Un registro por cada descuento aplicado o quitado sobre una orden (una mesa
// con varias rondas deja uno por ronda, unidos por `groupId`). La orden solo
// guarda el descuento VIGENTE de cada línea (uno nuevo reemplaza al anterior);
// esto guarda TODAS las operaciones para el reporte de control del panel.
//
// Nunca se edita ni se borra desde la app. Los importes son centavos.
//   · grossCents            importe de la orden sin descuentos
//   · totalBeforeCents      total de la orden antes de la operación
//   · totalAfterCents       total después (= importe final de la orden)
//   · discountDeltaCents    lo que cambió el descuento (negativo al quitar)
//   · orderDiscountCents    descuento total de la orden después
// La autorización se evalúa sobre la CUENTA (orden o rondas sin cobrar de la
// mesa): `accountGrossCents` / `accountDiscountCents` son esos importes.
// ============================================================================

export type DiscountEventAction = 'apply' | 'remove'
export type DiscountApprovalMode = 'self' | 'pin' | 'offline_pin' | 'none'

export interface IPosDiscountEvent extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  orderPosId: string
  tableId: string | null
  tableNumber: number | null
  groupId: string
  action: DiscountEventAction
  scope: 'item' | 'order' | 'table'
  lineId: string | null
  lineName: string | null
  kind: 'percent' | 'amount' | null
  value: number | null
  /** Modo «importe final»: lo que el cajero escribió que quería cobrar. */
  requestedFinalCents: number | null
  reason: string | null
  note: string | null
  grossCents: number
  totalBeforeCents: number
  totalAfterCents: number
  discountDeltaCents: number
  orderDiscountCents: number
  accountGrossCents: number
  accountDiscountCents: number
  byUserId: string
  byName: string | null
  byRole: string | null
  approvedByUserId: string | null
  approverName: string | null
  approvalMode: DiscountApprovalMode
  policyVersion: number
  offline: boolean
  opId: string | null
  deviceId: string | null
  occurredAt: Date
  createdAt: Date
}

const PosDiscountEventSchema = new Schema<IPosDiscountEvent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderPosId: { type: String, required: true, maxlength: 64 },
    tableId: { type: String, default: null, maxlength: 64 },
    tableNumber: { type: Number, default: null },
    groupId: { type: String, required: true, maxlength: 64 },
    action: { type: String, enum: ['apply', 'remove'], required: true },
    scope: { type: String, enum: ['item', 'order', 'table'], required: true },
    lineId: { type: String, default: null, maxlength: 64 },
    lineName: { type: String, default: null, maxlength: 200 },
    kind: { type: String, enum: ['percent', 'amount', null], default: null },
    value: { type: Number, default: null },
    requestedFinalCents: { type: Number, default: null, min: 0 },
    reason: { type: String, default: null, maxlength: 32 },
    note: { type: String, default: null, maxlength: 200 },
    grossCents: { type: Number, required: true, min: 0 },
    totalBeforeCents: { type: Number, required: true, min: 0 },
    totalAfterCents: { type: Number, required: true, min: 0 },
    discountDeltaCents: { type: Number, required: true },
    orderDiscountCents: { type: Number, required: true, min: 0 },
    accountGrossCents: { type: Number, required: true, min: 0 },
    accountDiscountCents: { type: Number, required: true, min: 0 },
    byUserId: { type: String, required: true, maxlength: 64 },
    byName: { type: String, default: null, maxlength: 120 },
    byRole: { type: String, default: null, maxlength: 32 },
    approvedByUserId: { type: String, default: null, maxlength: 64 },
    approverName: { type: String, default: null, maxlength: 120 },
    approvalMode: { type: String, enum: ['self', 'pin', 'offline_pin', 'none'], required: true },
    policyVersion: { type: Number, required: true, min: 0 },
    offline: { type: Boolean, default: false },
    opId: { type: String, default: null, maxlength: 64 },
    deviceId: { type: String, default: null, maxlength: 64 },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'pos_discount_events' }
)

// Reporte del panel: por comercio y fecha, con filtros por sede/usuario/motivo.
PosDiscountEventSchema.index({ tenantId: 1, occurredAt: -1 }, { name: 'tenant_date' })
PosDiscountEventSchema.index({ tenantId: 1, locationId: 1, occurredAt: -1 }, { name: 'tenant_location_date' })
PosDiscountEventSchema.index({ tenantId: 1, orderPosId: 1 }, { name: 'tenant_order' })

export default (mongoose.models.PosDiscountEvent as mongoose.Model<IPosDiscountEvent>) ||
  mongoose.model<IPosDiscountEvent>('PosDiscountEvent', PosDiscountEventSchema)
