import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// CatalogProduct — catálogo comercial maestro por marca (multi-rubro, etapa 1)
// ============================================================================
// Informe de implementación 21/11/2026, §2.2 y §2.3:
//   · Un producto (o servicio) por documento, a nivel de MARCA (tenant).
//   · Cada variante tiene identificador estable (`_id`, nunca se regenera),
//     código propio único en la marca y código de barras opcional.
//   · Cada sucursal tiene su precio y disponibilidad (`offers`). La existencia
//     (stock) vive en el motor de inventario: un insumo `kind: 'merchandise'`
//     vinculado a la variante (InventorySKU.catalogVariantId).
//   · Se proyecta a la carta de cada sede (lib/catalog/projection) para vender
//     con el checkout y el POS de siempre. Los platos siguen en Menu.
// ============================================================================

export interface ICatalogOption {
  name: string
  value: string
}

export interface ICatalogOffer {
  locationId: Types.ObjectId
  /** Precio en esta sucursal en centavos (null = precio de lista). @storedAs cents */
  price: number | null
  /** false = no se vende en esta sucursal. */
  available: boolean
}

export interface ICatalogVariant {
  _id: Types.ObjectId
  /** Código interno (SKU) único en la marca. */
  code: string
  barcode?: string | null
  /** Nombre visible de la variante (ej. «Negra · iPhone 15»). */
  name: string
  /** Atributos que distinguen la variante (color, modelo, talle…). */
  options: ICatalogOption[]
  /** Precio de lista en centavos. @storedAs cents */
  listPrice: number
  offers: ICatalogOffer[]
  isActive: boolean
}

// Interfaz plana (no extiende Document): el campo `model` choca con Document.model().
export interface ICatalogProduct {
  _id: Types.ObjectId
  tenantId: Types.ObjectId
  kind: 'product' | 'service'
  name: string
  description: string
  category: string
  brand: string
  model: string
  imageUrl: string
  /** Características / especificaciones (ficha técnica). */
  attributes: ICatalogOption[]
  variants: ICatalogVariant[]
  status: 'active' | 'archived'
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

const OptionSchema = new Schema<ICatalogOption>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  value: { type: String, required: true, trim: true, maxlength: 200 },
}, { _id: false })

const OfferSchema = new Schema<ICatalogOffer>({
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  price: { type: Number, default: null, min: 0 },
  available: { type: Boolean, default: true },
}, { _id: false })

const VariantSchema = new Schema<ICatalogVariant>({
  code: { type: String, required: true, trim: true, maxlength: 60 },
  barcode: { type: String, trim: true, maxlength: 60, default: undefined },
  name: { type: String, default: '', trim: true, maxlength: 120 },
  options: { type: [OptionSchema], default: [] },
  listPrice: { type: Number, required: true, min: 0 },
  offers: { type: [OfferSchema], default: [] },
  isActive: { type: Boolean, default: true },
}, { _id: true })

const CatalogProductSchema = new Schema<ICatalogProduct>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    kind: { type: String, enum: ['product', 'service'], default: 'product' },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    category: { type: String, default: '', trim: true, maxlength: 80 },
    brand: { type: String, default: '', trim: true, maxlength: 80 },
    model: { type: String, default: '', trim: true, maxlength: 80 },
    imageUrl: { type: String, default: '', maxlength: 500 },
    attributes: { type: [OptionSchema], default: [] },
    variants: {
      type: [VariantSchema],
      validate: { validator: (v: unknown[]) => Array.isArray(v) && v.length >= 1 && v.length <= 200, message: 'Entre 1 y 200 variantes' },
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
)

CatalogProductSchema.index({ tenantId: 1, status: 1, category: 1, sortOrder: 1 })
// Código interno y de barras únicos dentro de la marca (entre productos; dentro
// de un mismo producto lo valida lib/catalog/validation).
CatalogProductSchema.index(
  { tenantId: 1, 'variants.code': 1 },
  { unique: true, name: 'catalog_variant_code' }
)
CatalogProductSchema.index(
  { tenantId: 1, 'variants.barcode': 1 },
  { unique: true, partialFilterExpression: { 'variants.barcode': { $type: 'string' } }, name: 'catalog_variant_barcode' }
)

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as Record<string, unknown>).CatalogProduct
}

const CatalogProduct = mongoose.models.CatalogProduct || mongoose.model<ICatalogProduct>('CatalogProduct', CatalogProductSchema)
export default CatalogProduct
