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

// Copia local de TABLE_SHAPES (@takeasygo/business/floor-plan): el modelo no
// importa business (rompe el mock de vitest); un test verifica que coincidan.
export const TABLE_SHAPE_VALUES = ['round', 'square', 'rect', 'clover'] as const
export type TableShapeValue = (typeof TABLE_SHAPE_VALUES)[number]

export interface ITable extends Document {
  posId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  number: number
  capacity: number
  status: TableStatus
  /** posId de la orden abierta en la mesa (no _id). */
  currentOrderId: string | null
  /**
   * Quién atiende la mesa (30/10): id y nombre del usuario del token que la
   * abrió o la tomó. Lo fija el servidor, nunca el cliente. Se borra al liberar.
   */
  serverId: string | null
  serverName: string | null
  section: string | null
  needsBill: boolean
  /**
   * Comensales de la ocupación actual (Fase B, 2026-10). Se informa al abrir
   * la mesa y se borra al liberarla. Base para «ticket por cubierto».
   */
  guests: number | null
  /**
   * Sector de la mesa = espacio de la sede (Location.spaces._id). Fuente
   * única: los sectores se definen en el SaaS y el POS los usa (obs. 24/10).
   * `section` queda como nombre para mostrar (se resuelve al listar).
   */
  spaceId: mongoose.Types.ObjectId | null
  /** Reserva asignada a la mesa mientras está `reserved` (null = ninguna). */
  reservationId: mongoose.Types.ObjectId | null
  /**
   * Plano del salón (30/10): posición en el sector, forma y giro. Opcional:
   * sin layout el POS acomoda la mesa solo. Lo valida validateTableLayout.
   */
  layout: { x: number; y: number; shape: TableShapeValue; rotation: 0 | 90 } | null
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
    serverName: { type: String, default: null, trim: true, maxlength: 120 },
    section: { type: String, default: null, trim: true },
    needsBill: { type: Boolean, default: false },
    guests: { type: Number, default: null, min: 1, max: 99 },
    spaceId: { type: Schema.Types.ObjectId, default: null },
    reservationId: { type: Schema.Types.ObjectId, default: null },
    layout: {
      type: new Schema(
        {
          x: { type: Number, required: true, min: 0, max: 2000 },
          y: { type: Number, required: true, min: 0, max: 2000 },
          shape: { type: String, enum: TABLE_SHAPE_VALUES, required: true },
          rotation: { type: Number, enum: [0, 90], default: 0 },
        },
        { _id: false }
      ),
      default: null,
    },
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
