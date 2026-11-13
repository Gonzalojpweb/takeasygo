import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryTransfer — Circuito de transferencias entre sedes (F1, 13/11/2026)
// Colección: inventory_transfers
// ============================================================================
// pedida → autorizada → despachada → recibida (o rechazada / cancelada).
// Solo entre sedes de la MISMA marca (mismo tenant): entre marcas sería una
// venta entre unidades fiscales distintas.
//
// El stock lo mueve el ledger, no este documento:
//   · al despachar: TransferOut en el depósito de origen (cantidad despachada);
//   · al recibir:   TransferIn en el depósito de destino (cantidad recibida).
// Ambos con correlationId = transferId y eventIds determinísticos, así que un
// reintento no duplica. Lo que se despachó y no llegó queda como diferencia
// del envío en las líneas (no está en ningún depósito).
// ============================================================================

export const TRANSFER_STATUSES = ['requested', 'approved', 'dispatched', 'received', 'rejected', 'cancelled'] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]

export interface ITransferLine {
  skuId: mongoose.Types.ObjectId
  /** Unidad canónica del insumo al crear la transferencia. */
  unit: string
  requested: number
  approved: number | null
  dispatched: number | null
  received: number | null
  /** Costo promedio del origen al despachar (centavos por unidad canónica). */
  unitCostCents: number | null
}

export interface ITransferStep {
  by: mongoose.Types.ObjectId | null
  at: Date
}

export interface IInventoryTransfer extends Document {
  tenantId: mongoose.Types.ObjectId
  /** UUID: correlationId del ledger y base de los eventIds. */
  transferId: string
  status: TransferStatus
  fromLocationId: mongoose.Types.ObjectId
  /** Depósito del que sale; se puede elegir al autorizar o despachar. */
  fromStorageLocationId: mongoose.Types.ObjectId | null
  toLocationId: mongoose.Types.ObjectId
  /** Depósito donde entra; se puede cambiar al recibir. */
  toStorageLocationId: mongoose.Types.ObjectId | null
  lines: ITransferLine[]
  note: string | null
  rejectReason: string | null
  receiveNote: string | null
  requested: ITransferStep | null
  approved: ITransferStep | null
  dispatched: ITransferStep | null
  received: ITransferStep | null
  rejected: ITransferStep | null
  cancelled: ITransferStep | null
  createdAt: Date
  updatedAt: Date
}

const StepSchema = new Schema<ITransferStep>({
  by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, required: true },
}, { _id: false })

const LineSchema = new Schema<ITransferLine>({
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  unit: { type: String, required: true },
  requested: { type: Number, required: true, min: 0 },
  approved: { type: Number, default: null, min: 0 },
  dispatched: { type: Number, default: null, min: 0 },
  received: { type: Number, default: null, min: 0 },
  unitCostCents: { type: Number, default: null },
}, { _id: false })

const InventoryTransferSchema = new Schema<IInventoryTransfer>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  transferId: { type: String, required: true },
  status: { type: String, enum: TRANSFER_STATUSES, required: true },
  fromLocationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  fromStorageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', default: null },
  toLocationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  toStorageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', default: null },
  lines: { type: [LineSchema], default: [] },
  note: { type: String, default: null, maxlength: 300 },
  rejectReason: { type: String, default: null, maxlength: 300 },
  receiveNote: { type: String, default: null, maxlength: 300 },
  requested: { type: StepSchema, default: null },
  approved: { type: StepSchema, default: null },
  dispatched: { type: StepSchema, default: null },
  received: { type: StepSchema, default: null },
  rejected: { type: StepSchema, default: null },
  cancelled: { type: StepSchema, default: null },
}, { timestamps: true, collection: 'inventory_transfers' })

InventoryTransferSchema.index({ tenantId: 1, transferId: 1 }, { unique: true })
// Bandejas por sede: lo que me pidieron (origen) y lo que pedí (destino).
InventoryTransferSchema.index({ tenantId: 1, fromLocationId: 1, status: 1, updatedAt: -1 })
InventoryTransferSchema.index({ tenantId: 1, toLocationId: 1, status: 1, updatedAt: -1 })

export default (mongoose.models.InventoryTransfer as mongoose.Model<IInventoryTransfer>) ||
  mongoose.model<IInventoryTransfer>('InventoryTransfer', InventoryTransferSchema)
