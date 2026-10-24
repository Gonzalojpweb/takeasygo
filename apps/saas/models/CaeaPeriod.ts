import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// CaeaPeriod — CAEA otorgado por ARCA para una quincena (contingencia, Fase 6)
// ============================================================================
// Uno por (comercio, ambiente, período AAAAMM, orden 1|2). Se pide por
// adelantado (cron diario) y se usa solo si ARCA no responde al facturar.
// `noMovementInformed`: puntos de venta de contingencia ya informados «sin
// movimiento» al terminar la quincena.
// ============================================================================

export interface ICaeaPeriod extends Document {
  tenantId: mongoose.Types.ObjectId
  environment: string
  period: string
  order: 1 | 2
  caea: string
  validFrom: Date | null
  validTo: Date | null
  reportDeadline: Date | null
  noMovementInformed: number[]
  createdAt: Date
  updatedAt: Date
}

const CaeaPeriodSchema = new Schema<ICaeaPeriod>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    environment: { type: String, required: true },
    period: { type: String, required: true, match: /^\d{6}$/ },
    order: { type: Number, enum: [1, 2], required: true },
    caea: { type: String, required: true, maxlength: 20 },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
    reportDeadline: { type: Date, default: null },
    noMovementInformed: { type: [Number], default: [] },
  },
  { timestamps: true }
)

CaeaPeriodSchema.index({ tenantId: 1, environment: 1, period: 1, order: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'CaeaPeriod')
}

const CaeaPeriod =
  (mongoose.models.CaeaPeriod as mongoose.Model<ICaeaPeriod>) ||
  mongoose.model<ICaeaPeriod>('CaeaPeriod', CaeaPeriodSchema)

export default CaeaPeriod
