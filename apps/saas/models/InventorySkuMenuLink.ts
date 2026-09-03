import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventorySkuMenuLink — Vínculo SKU ↔ Ítem de menú
// FASE04 §3.8 — Colección: inventory_sku_menu_links
// ============================================================================

export interface IInventorySkuMenuLink extends Document {
  tenantId: mongoose.Types.ObjectId
  menuItemId: string
  recipeId: mongoose.Types.ObjectId
  variantOverrides?: Array<{ variantId: string; recipeId: mongoose.Types.ObjectId }>
  isActive: boolean
  confidence: number
  createdAt: Date
  updatedAt: Date
}

const VariantOverrideSchema = new Schema({
  variantId: { type: String, required: true },
  recipeId: { type: Schema.Types.ObjectId, ref: 'InventoryRecipe', required: true },
}, { _id: false })

const InventorySkuMenuLinkSchema = new Schema<IInventorySkuMenuLink>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  menuItemId: { type: String, required: true },
  recipeId: { type: Schema.Types.ObjectId, ref: 'InventoryRecipe', required: true },
  variantOverrides: { type: [VariantOverrideSchema], default: [] },
  isActive: { type: Boolean, default: true },
  confidence: { type: Number, default: 0.5, min: 0, max: 1 },
}, { timestamps: true })

InventorySkuMenuLinkSchema.index({ tenantId: 1, isActive: 1 })
InventorySkuMenuLinkSchema.index({ tenantId: 1, menuItemId: 1 }, { unique: true })

const InventorySkuMenuLink = mongoose.models.InventorySkuMenuLink || mongoose.model<IInventorySkuMenuLink>('InventorySkuMenuLink', InventorySkuMenuLinkSchema, 'inventory_sku_menu_links')
export default InventorySkuMenuLink
