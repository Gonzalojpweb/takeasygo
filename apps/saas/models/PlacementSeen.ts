import mongoose, { Schema } from 'mongoose'

// ============================================================================
// PlacementSeen — deduplicación de métricas de piezas (20/11/2026)
// ============================================================================
// _id = sha256(pepper + sesión + pieza + superficie + evento + día). Solo el
// hash y el vencimiento: no se puede revertir ni cruzar con otras colecciones.
// TTL 48 h (alcanza para cubrir el día en curso en cualquier huso).
// ============================================================================

export const PLACEMENT_SEEN_TTL_MS = 48 * 60 * 60 * 1000

export interface IPlacementSeen {
  _id: string
  expiresAt: Date
}

const PlacementSeenSchema = new Schema<IPlacementSeen>(
  {
    _id: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
)

PlacementSeenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const PlacementSeen =
  (mongoose.models.PlacementSeen as mongoose.Model<IPlacementSeen>) ||
  mongoose.model<IPlacementSeen>('PlacementSeen', PlacementSeenSchema)
export default PlacementSeen
