import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryStateSnapshot v2 — estado al INICIO de cada día local
// Colección: inventory_state_snapshots · DECISIONES_VIGENTES D-05
// ============================================================================
// Caché derivada (no historia): permite re-proyectar un evento tardío desde
// el inicio de su día en vez de desde el evento cero, y responder "¿qué
// creíamos el martes a la mañana?". Se escribe al proyectar (upsert por día):
// un evento tardío vuelve a escribir los snapshots de los días posteriores.
// ============================================================================

export interface IInventoryStateSnapshot extends Document {
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  /** Índice de día local (BeliefState.dayIndex). */
  dayIndex: number
  /** Inicio del día (UTC) = asOf del estado guardado. */
  snapshotAt: Date
  state: Record<string, unknown>
  paramsVersion: string
  createdAt: Date
}

const InventoryStateSnapshotSchema = new Schema<IInventoryStateSnapshot>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', required: true },
  dayIndex: { type: Number, required: true },
  snapshotAt: { type: Date, required: true },
  state: { type: Schema.Types.Mixed, required: true },
  paramsVersion: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false })

InventoryStateSnapshotSchema.index(
  { tenantId: 1, skuId: 1, storageLocationId: 1, dayIndex: -1 },
  { unique: true, name: 'snapshot_day' },
)

const InventoryStateSnapshot =
  (mongoose.models.InventoryStateSnapshot as mongoose.Model<IInventoryStateSnapshot>) ||
  mongoose.model<IInventoryStateSnapshot>('InventoryStateSnapshot', InventoryStateSnapshotSchema, 'inventory_state_snapshots')
export default InventoryStateSnapshot
