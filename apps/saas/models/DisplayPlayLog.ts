import mongoose, { Schema } from 'mongoose'

// ============================================================================
// DisplayPlayLog — proof of play de las pantallas (Proximo_Nivel §5)
// ============================================================================
// Una fila por cada vez que una pieza (o un paso de una secuencia) estuvo en
// pantalla: equipo, comercio, sede, pieza, paso, inicio y fin. Sin datos de
// personas. Se borra sola a los 90 días (TTL). Los totales diarios siguen en
// PlacementDailyStat; esto es el detalle para «cuándo se mostró».
// ============================================================================

export interface IDisplayPlayLog {
  deviceId: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId | null
  pieceId: mongoose.Types.ObjectId
  /** Paso de la secuencia (0…4) o null si es una pieza suelta. */
  step: number | null
  startedAt: Date
  endedAt: Date
  expiresAt: Date
}

export const PLAY_LOG_TTL_MS = 90 * 24 * 60 * 60 * 1000

const DisplayPlayLogSchema = new Schema<IDisplayPlayLog>(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: 'DisplayDevice', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    pieceId: { type: Schema.Types.ObjectId, ref: 'AppStory', required: true },
    step: { type: Number, default: null, min: 0, max: 9 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
)
DisplayPlayLogSchema.index({ tenantId: 1, pieceId: 1, startedAt: -1 })
DisplayPlayLogSchema.index({ tenantId: 1, deviceId: 1, startedAt: -1 })
DisplayPlayLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const DisplayPlayLog =
  (mongoose.models.DisplayPlayLog as mongoose.Model<IDisplayPlayLog>) ||
  mongoose.model<IDisplayPlayLog>('DisplayPlayLog', DisplayPlayLogSchema)
export default DisplayPlayLog
