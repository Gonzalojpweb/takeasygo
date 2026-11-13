import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// OrgCatalogPush — Envíos de la carta central a las sedes (F3)
// Colección: org_catalog_pushes · uno por sede y envío
// ============================================================================
// Guarda cómo estaba la carta de la sede ANTES del envío (`before`, solo las
// categorías) y el updatedAt con que quedó. Deshacer restaura `before` si la
// carta no se tocó después (updatedAt igual); si se tocó, no pisa nada.
// ============================================================================

export interface IOrgCatalogPushSummary {
  created: number
  updated: number
  linked: number
  unchanged: number
  localPricesKept: number
  categoriesCreated: number
}

export interface IOrgCatalogPush extends Document {
  organizationId: mongoose.Types.ObjectId
  /** Mismo id para todas las sedes de un mismo envío. */
  pushId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  menuId: mongoose.Types.ObjectId
  fields: string[]
  itemKeys: string[]
  summary: IOrgCatalogPushSummary
  before: unknown[]
  afterUpdatedAt: Date
  by: mongoose.Types.ObjectId | null
  undoneAt: Date | null
  undoneBy: mongoose.Types.ObjectId | null
  createdAt: Date
}

const OrgCatalogPushSchema = new Schema<IOrgCatalogPush>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  pushId: { type: String, required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  menuId: { type: Schema.Types.ObjectId, ref: 'Menu', required: true },
  fields: { type: [String], default: [] },
  itemKeys: { type: [String], default: [] },
  summary: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    linked: { type: Number, default: 0 },
    unchanged: { type: Number, default: 0 },
    localPricesKept: { type: Number, default: 0 },
    categoriesCreated: { type: Number, default: 0 },
  },
  before: { type: [Schema.Types.Mixed], default: [] },
  afterUpdatedAt: { type: Date, required: true },
  by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  undoneAt: { type: Date, default: null },
  undoneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'org_catalog_pushes', minimize: false })

OrgCatalogPushSchema.index({ organizationId: 1, createdAt: -1 })
OrgCatalogPushSchema.index({ pushId: 1, tenantId: 1, locationId: 1 }, { unique: true })

export default (mongoose.models.OrgCatalogPush as mongoose.Model<IOrgCatalogPush>) ||
  mongoose.model<IOrgCatalogPush>('OrgCatalogPush', OrgCatalogPushSchema)
