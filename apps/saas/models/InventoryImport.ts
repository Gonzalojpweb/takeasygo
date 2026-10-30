import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryImport — Importaciones de inventario desde otro sistema
// Colección: inventory_imports · Importador v1 (30/10/2026)
// ============================================================================
// Un documento por importación confirmada (Fudo, Maxirest, planilla propia…):
// qué se creó, qué stock se cargó y quién lo hizo. Es lo que permite
// DESHACER: desactiva los insumos que creó ese lote si nadie los usó después
// (el ledger es de solo agregar: los conteos quedan como historia, con
// `correlationId = import:<_id>`).
// El archivo NO se guarda: solo el nombre y el resumen.
// ============================================================================

export const IMPORT_SOURCES = ['fudo', 'generic'] as const

export interface IInventoryImport extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  source: (typeof IMPORT_SOURCES)[number]
  fileName: string
  createdBy: mongoose.Types.ObjectId | null
  /** Insumos que creó este lote (los únicos que «deshacer» desactiva). */
  createdSkuIds: mongoose.Types.ObjectId[]
  /** Insumos que ya existían y solo recibieron el conteo de apertura. */
  matchedSkuIds: mongoose.Types.ObjectId[]
  counts: { created: number; matched: number; stockLoaded: number; skipped: number }
  status: 'done' | 'undone'
  undoneAt: Date | null
  undoneBy: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const InventoryImportSchema = new Schema<IInventoryImport>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  source: { type: String, enum: IMPORT_SOURCES, required: true },
  fileName: { type: String, required: true, trim: true, maxlength: 160 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdSkuIds: { type: [Schema.Types.ObjectId], default: [] },
  matchedSkuIds: { type: [Schema.Types.ObjectId], default: [] },
  counts: {
    created: { type: Number, default: 0, min: 0 },
    matched: { type: Number, default: 0, min: 0 },
    stockLoaded: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
  },
  status: { type: String, enum: ['done', 'undone'], default: 'done' },
  undoneAt: { type: Date, default: null },
  undoneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'inventory_imports' })

// Historial por comercio y sede, lo más nuevo primero.
InventoryImportSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })

export default (mongoose.models.InventoryImport as mongoose.Model<IInventoryImport>) ||
  mongoose.model<IInventoryImport>('InventoryImport', InventoryImportSchema)
