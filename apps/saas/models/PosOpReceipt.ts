import mongoose, { Schema, type Document } from 'mongoose'

// ============================================================================
// PosOpReceipt — «esta operación del POS ya se aplicó» (POS offline V2, 12/11)
// ============================================================================
// Un equipo sin internet guarda cada operación (crear ronda, ocupar mesa,
// cobrar…) con un `opId` y la reenvía al volver la red. Si el reenvío se corta
// a mitad de camino, el equipo la vuelve a mandar: este recibo hace que el
// server la aplique UNA sola vez y responda siempre lo mismo.
//
//   pending → la operación se está aplicando (otro reenvío espera: 409)
//   done    → ya se aplicó: se devuelve la respuesta guardada
//
// Un 5xx o una excepción borra el recibo: la operación se puede reintentar.
// Se borra solo a los 30 días (TTL).
// ============================================================================

export interface IPosOpReceipt extends Document {
  tenantId: mongoose.Types.ObjectId
  opId: string
  deviceId: string | null
  method: string
  path: string
  status: 'pending' | 'done'
  responseStatus: number | null
  responseBody: unknown
  occurredAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const PosOpReceiptSchema = new Schema<IPosOpReceipt>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    opId: { type: String, required: true, maxlength: 64 },
    deviceId: { type: String, default: null, maxlength: 64 },
    method: { type: String, required: true },
    path: { type: String, required: true, maxlength: 300 },
    status: { type: String, enum: ['pending', 'done'], required: true },
    responseStatus: { type: Number, default: null },
    responseBody: { type: Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'pos_op_receipts' }
)

PosOpReceiptSchema.index({ tenantId: 1, opId: 1 }, { unique: true, name: 'uniq_tenant_op' })
PosOpReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, name: 'ttl_30d' })

export default (mongoose.models.PosOpReceipt as mongoose.Model<IPosOpReceipt>) ||
  mongoose.model<IPosOpReceipt>('PosOpReceipt', PosOpReceiptSchema)
