import mongoose, { Schema, type Document } from 'mongoose'

// ============================================================================
// PriceChangeBatch — un cambio de precios de «Actualizar precios»
// ============================================================================
// Guarda el plan (reglas, qué precios, ajustes a mano), la lista EXACTA de
// cambios calculada por el servidor (antes → después, lib/menu/price-engine)
// y su ciclo de vida:
//   pending_approval → (aprobado) applied | rejected | cancelled
//   scheduled        → applied (cron) | cancelled | failed
//   applied          → reverted («Deshacer»)
//   failed           → la carta cambió entre medio (conflictos) o error
// Quién: Administrador y Manager aplican, programan y aprueban; el Cajero
// solo propone (queda pendiente de aprobación).
// ============================================================================

export type PriceBatchStatus = 'pending_approval' | 'scheduled' | 'applying' | 'applied' | 'reverted' | 'rejected' | 'cancelled' | 'failed'

export interface PriceBatchActor {
  userId: string | null
  name: string
  role: string
}

export interface IPriceChangeBatch extends Document {
  tenantId: mongoose.Types.ObjectId
  locationIds: mongoose.Types.ObjectId[]
  status: PriceBatchStatus
  /** Plan tal como se armó (reglas, qué precios, ajustes a mano, origen). */
  plan: Record<string, unknown>
  changes: Record<string, unknown>[]
  summary: { items: number; changes: number; warnings: { itemName: string; message: string; level: string }[] }
  note: string
  source: 'wizard' | 'excel' | 'image'
  createdBy: PriceBatchActor
  scheduledFor: Date | null
  approvedBy: PriceBatchActor | null
  approvedAt: Date | null
  rejectedBy: PriceBatchActor | null
  rejectedAt: Date | null
  rejectReason: string | null
  appliedAt: Date | null
  revertedBy: PriceBatchActor | null
  revertedAt: Date | null
  error: string | null
  conflicts: { itemName: string; label: string; expected: number; current: number | null }[]
  createdAt: Date
  updatedAt: Date
}

const ActorSchema = new Schema<PriceBatchActor>(
  { userId: { type: String, default: null }, name: { type: String, default: '' }, role: { type: String, default: '' } },
  { _id: false }
)

const PriceChangeBatchSchema = new Schema<IPriceChangeBatch>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationIds: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
    status: {
      type: String,
      enum: ['pending_approval', 'scheduled', 'applying', 'applied', 'reverted', 'rejected', 'cancelled', 'failed'],
      required: true,
    },
    plan: { type: Schema.Types.Mixed, default: {} },
    changes: { type: Schema.Types.Mixed, default: [] },
    summary: {
      items: { type: Number, default: 0 },
      changes: { type: Number, default: 0 },
      warnings: { type: Schema.Types.Mixed, default: [] },
    },
    note: { type: String, default: '', maxlength: 300 },
    source: { type: String, enum: ['wizard', 'excel', 'image'], default: 'wizard' },
    createdBy: { type: ActorSchema, required: true },
    scheduledFor: { type: Date, default: null },
    approvedBy: { type: ActorSchema, default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: ActorSchema, default: null },
    rejectedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null, maxlength: 300 },
    appliedAt: { type: Date, default: null },
    revertedBy: { type: ActorSchema, default: null },
    revertedAt: { type: Date, default: null },
    error: { type: String, default: null },
    conflicts: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, collection: 'price_change_batches' }
)

PriceChangeBatchSchema.index({ tenantId: 1, createdAt: -1 })
PriceChangeBatchSchema.index({ status: 1, scheduledFor: 1 })

export default (mongoose.models.PriceChangeBatch as mongoose.Model<IPriceChangeBatch>) ||
  mongoose.model<IPriceChangeBatch>('PriceChangeBatch', PriceChangeBatchSchema)
