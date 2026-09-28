import mongoose, { Schema, Document } from 'mongoose'
import type { TableStatus } from '@takeasygo/types'

// ============================================================================
// Table — mesas del POS Online (V1)
// ============================================================================
// Fuente de verdad del servidor. El POS sincroniza por polling y usa esto
// como caché de solo lectura (Dexie).
//
// - `posId` es el id que genera el POS con crypto.randomUUID() y es el `id`
//   que expone el contrato /api/[tenant]/pos/*. `_id` sigue siendo ObjectId.
//   Ver docs/POS-ONLINE-PLAN.md §1.3.
//
// - `locationId` es obligatorio: las mesas son físicas de una sede y el token
//   del POS lleva el claim `locationId` (multi-sede). El endpoint debe
//   resolver el default del tenant cuando el token legacy no lo trae.
//
// - Las transiciones de `status` NO se validan acá (Mongoose no expresa bien
//   el grafo): se validan con assertTableTransition() de @takeasygo/business,
//   que es la misma función que usa el POS client-side.
// ============================================================================

export interface ITable extends Document {
  posId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  number: number
  capacity: number
  status: TableStatus
  /** posId de la orden abierta en la mesa (no _id). */
  currentOrderId: string | null
  /** posId del mozo asignado. */
  serverId: string | null
  section: string | null
  needsBill: boolean
  createdAt: Date
  updatedAt: Date
}

const TableSchema = new Schema<ITable>(
  {
    posId: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    number: { type: Number, required: true, min: 1 },
    capacity: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['free', 'occupied', 'reserved', 'closed', 'needs_attention'] as TableStatus[],
      default: 'free',
    },
    currentOrderId: { type: String, default: null },
    serverId: { type: String, default: null },
    section: { type: String, default: null, trim: true },
    needsBill: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Idempotencia: el id lo genera el POS, un reintento no debe crear otra mesa.
TableSchema.index({ tenantId: 1, posId: 1 }, { unique: true })
// Número de mesa único dentro de la sede.
TableSchema.index({ tenantId: 1, locationId: 1, number: 1 }, { unique: true })
TableSchema.index({ tenantId: 1, locationId: 1, status: 1 })
TableSchema.index({ tenantId: 1, locationId: 1, section: 1 })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'Table')
}

const Table =
  (mongoose.models.Table as mongoose.Model<ITable>) ||
  mongoose.model<ITable>('Table', TableSchema)

export default Table
