import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// FiscalCounter — numeración local de los puntos de venta de CONTINGENCIA
// ============================================================================
// Con CAEA no se le pregunta a ARCA el número (justamente no responde): el
// sistema numera solo, con un contador atómico ($inc). Se sincroniza con
// «último autorizado» de ARCA cada vez que hay conexión (cron del CAEA), así
// nunca arranca atrasado.
// ============================================================================

export interface IFiscalCounter extends Document {
  tenantId: mongoose.Types.ObjectId
  environment: string
  pointOfSale: number
  cbteTipo: number
  last: number
}

const FiscalCounterSchema = new Schema<IFiscalCounter>({
  tenantId: { type: Schema.Types.ObjectId, required: true },
  environment: { type: String, required: true },
  pointOfSale: { type: Number, required: true },
  cbteTipo: { type: Number, required: true },
  last: { type: Number, required: true, default: 0, min: 0 },
})

FiscalCounterSchema.index({ tenantId: 1, environment: 1, pointOfSale: 1, cbteTipo: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'FiscalCounter')
}

const FiscalCounter =
  (mongoose.models.FiscalCounter as mongoose.Model<IFiscalCounter>) ||
  mongoose.model<IFiscalCounter>('FiscalCounter', FiscalCounterSchema)

export default FiscalCounter
