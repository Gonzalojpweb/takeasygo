import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// FiscalSequenceLock — un comprobante a la vez por punto de venta y tipo
// ============================================================================
// ARCA numera en orden estricto: «último autorizado + 1». Si dos cajas piden
// el CAE del mismo punto de venta y tipo a la vez, una recibe un rechazo
// (10016) o, peor, se pisan. Este candado serializa la emisión por
// (comercio, ambiente, punto de venta, tipo). Vence solo (`lockedUntil`) si
// una instancia muere a mitad de camino.
// ============================================================================

export interface IFiscalSequenceLock extends Document {
  tenantId: mongoose.Types.ObjectId
  environment: string
  pointOfSale: number
  cbteTipo: number
  lockedUntil: Date | null
  holder: string | null
}

const FiscalSequenceLockSchema = new Schema<IFiscalSequenceLock>({
  tenantId: { type: Schema.Types.ObjectId, required: true },
  environment: { type: String, required: true },
  pointOfSale: { type: Number, required: true },
  cbteTipo: { type: Number, required: true },
  lockedUntil: { type: Date, default: null },
  holder: { type: String, default: null },
})

FiscalSequenceLockSchema.index({ tenantId: 1, environment: 1, pointOfSale: 1, cbteTipo: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'FiscalSequenceLock')
}

const FiscalSequenceLock =
  (mongoose.models.FiscalSequenceLock as mongoose.Model<IFiscalSequenceLock>) ||
  mongoose.model<IFiscalSequenceLock>('FiscalSequenceLock', FiscalSequenceLockSchema)

export default FiscalSequenceLock
