import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// OrgCatalog — Carta central del grupo (F3, 13/11/2026)
// Colección: org_catalogs · una por organización
// ============================================================================
// El dueño edita acá los platos que comparten sus marcas y los ENVÍA a las
// cartas de las sedes (Menu). Las cartas siguen siendo de cada sede: lo que
// el POS, la app y las recetas leen no cambia de lugar. Cada plato enviado
// queda vinculado (Menu…items.master.itemKey = key de acá).
//
// Platos planos con categoryKey (sin subcategorías en la carta central).
// Precios en centavos. `customizationGroups` usa la misma forma que la carta.
// Un plato archivado no se envía más; lo ya enviado queda en las sedes.
// ============================================================================

export interface IOrgCatalogCategory {
  key: string
  name: string
  description: string
  sortOrder: number
}

export interface IOrgCatalogVariant {
  name: string
  /** @storedAs cents */
  price: number
  /** @storedAs cents */
  takeawayPrice: number | null
}

export interface IOrgCatalogItem {
  key: string
  categoryKey: string
  name: string
  description: string
  imageUrl: string
  /** @storedAs cents */
  price: number
  /** @storedAs cents — null = igual al de salón */
  takeawayPrice: number | null
  variants: IOrgCatalogVariant[]
  tags: string[]
  ivaRate: number | null
  /** Misma forma que Menu (grupos → opciones → subgrupos), sin _id. */
  customizationGroups: unknown[]
  isArchived: boolean
  updatedAt: Date
}

export interface IOrgCatalog extends Document {
  organizationId: mongoose.Types.ObjectId
  categories: IOrgCatalogCategory[]
  items: IOrgCatalogItem[]
  updatedBy: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const CategorySchema = new Schema<IOrgCatalogCategory>({
  key: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 300 },
  sortOrder: { type: Number, default: 0 },
}, { _id: false })

const VariantSchema = new Schema<IOrgCatalogVariant>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  price: { type: Number, required: true, min: 0 },
  takeawayPrice: { type: Number, default: null, min: 0 },
}, { _id: false })

const ItemSchema = new Schema<IOrgCatalogItem>({
  key: { type: String, required: true },
  categoryKey: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 600 },
  imageUrl: { type: String, default: '', maxlength: 600 },
  price: { type: Number, required: true, min: 0 },
  takeawayPrice: { type: Number, default: null, min: 0 },
  variants: { type: [VariantSchema], default: [] },
  tags: { type: [String], default: [] },
  ivaRate: { type: Number, default: null },
  customizationGroups: { type: [Schema.Types.Mixed], default: [] },
  isArchived: { type: Boolean, default: false },
  updatedAt: { type: Date, default: () => new Date() },
}, { _id: false })

const OrgCatalogSchema = new Schema<IOrgCatalog>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  categories: { type: [CategorySchema], default: [] },
  items: { type: [ItemSchema], default: [] },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'org_catalogs', minimize: false })

OrgCatalogSchema.index({ organizationId: 1 }, { unique: true })

export default (mongoose.models.OrgCatalog as mongoose.Model<IOrgCatalog>) ||
  mongoose.model<IOrgCatalog>('OrgCatalog', OrgCatalogSchema)
