import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryRecipe v2 — Receta versionada e inmutable
// Colección: inventory_recipes · DECISIONES_VIGENTES D-08
// ============================================================================
// · kind 'dish': consumo por porción de un ítem del menú de una sede
//   (menuItemId) y opcionalmente de una variante (variantName).
// · kind 'preparation': tanda de producción de un insumo `prepared`
//   (items → outputQuantity de outputSkuId). Las sub-recetas salen solas:
//   el plato consume "Salsa de tomate", producir salsa consume tomate.
// · Editar = nueva versión. La anterior queda isCurrent=false; los eventos
//   de venta referencian (recipeId, version) y nunca cambian.
// · Variante con `usesBaseRecipe`: el responsable CONFIRMÓ que la variante
//   consume igual que la base (sin ítems propios). Una variante sin receta
//   y sin esa confirmación NO descuenta (D-26): nunca se asume "Doble = base".
// · `removedAt`: la receta se quitó (el plato vuelve a "sin receta"). Junto
//   con la versión más alta permite resolver la vigente aunque un guardado se
//   haya cortado a mitad (R5, ver catalog.ts:loadCurrentRecipes).
// ============================================================================

export interface IRecipeItem {
  skuId: mongoose.Types.ObjectId
  quantity: number
  unit: 'kg' | 'g' | 'l' | 'ml' | 'unit'
}

export interface IInventoryRecipe extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId | null
  kind: 'dish' | 'preparation'
  /** Clave estable de la receta a través de sus versiones. */
  recipeKey: string
  name: string
  menuItemId: string | null
  variantName: string | null
  outputSkuId: mongoose.Types.ObjectId | null
  outputQuantity: number | null
  items: IRecipeItem[]
  version: number
  isCurrent: boolean
  usesBaseRecipe: boolean
  removedAt: Date | null
  createdBy: string | null
  createdAt: Date
}

const RecipeItemSchema = new Schema<IRecipeItem>({
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, enum: ['kg', 'g', 'l', 'ml', 'unit'], required: true },
}, { _id: false })

const InventoryRecipeSchema = new Schema<IInventoryRecipe>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
  kind: { type: String, enum: ['dish', 'preparation'], required: true },
  recipeKey: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  menuItemId: { type: String, default: null },
  variantName: { type: String, default: null },
  outputSkuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', default: null },
  outputQuantity: { type: Number, default: null },
  items: { type: [RecipeItemSchema], default: [] },
  version: { type: Number, required: true, min: 1 },
  isCurrent: { type: Boolean, default: true },
  usesBaseRecipe: { type: Boolean, default: false },
  removedAt: { type: Date, default: null },
  createdBy: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } })

InventoryRecipeSchema.index({ tenantId: 1, recipeKey: 1, version: 1 }, { unique: true, name: 'recipe_version' })
// Una sola versión vigente por clave.
InventoryRecipeSchema.index(
  { tenantId: 1, recipeKey: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true }, name: 'recipe_current' },
)
InventoryRecipeSchema.index({ tenantId: 1, locationId: 1, kind: 1, isCurrent: 1 })

const InventoryRecipe =
  (mongoose.models.InventoryRecipe as mongoose.Model<IInventoryRecipe>) ||
  mongoose.model<IInventoryRecipe>('InventoryRecipe', InventoryRecipeSchema, 'inventory_recipes')
export default InventoryRecipe
