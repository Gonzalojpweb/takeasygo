import mongoose, { Schema, Document, Types } from 'mongoose'

/**
 * Contador atómico por (tenant, sede, tipo) para numeración perLocation.
 *
 * Solo se usa cuando el flag `numbering.perLocation` está ON. Cada
 * combinación (tenantId, locationId, type) tiene su propia secuencia
 * incremental, garantizada por el índice único. La asignación es un
 * findOneAndUpdate con $inc + upsert, que es atómico en MongoDB.
 *
 * Off (default): este modelo no se toca y la numeración sigue como siempre.
 */
export type NumberingType = 'order' | 'reservation'

export const NUMBERING_TYPES: NumberingType[] = ['order', 'reservation']

export interface IPerLocationCounter extends Document {
  tenantId: Types.ObjectId
  locationId: Types.ObjectId
  type: NumberingType
  seq: number
  createdAt: Date
  updatedAt: Date
}

const PerLocationCounterSchema = new Schema<IPerLocationCounter>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    type: {
      type: String,
      enum: NUMBERING_TYPES,
      required: true,
    },
    seq: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

// Una secuencia por (tenant, sede, tipo). El índice único garantiza que
// findOneAndUpdate con $inc + upsert es atómico incluso con concurrencia.
PerLocationCounterSchema.index(
  { tenantId: 1, locationId: 1, type: 1 },
  { unique: true }
)

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as Record<string, unknown>).PerLocationCounter
}

const PerLocationCounter =
  (mongoose.models.PerLocationCounter as mongoose.Model<IPerLocationCounter>) ||
  mongoose.model<IPerLocationCounter>('PerLocationCounter', PerLocationCounterSchema)

export default PerLocationCounter
