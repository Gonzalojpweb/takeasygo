import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// InventoryRecipeModel — Recetas y transformaciones
// FASE04 §3.4 — Colección: inventory_recipes
// ============================================================================

export interface IRecipeInputDocument {
  skuId: mongoose.Types.ObjectId
  quantity: number
  unit: "kg" | "g" | "l" | "ml" | "unit"
  yieldPrior: { alpha: number; beta: number }
  yieldObservedMean?: number
  yieldObservationsCount: number
}

export interface IRecipeOutputDocument {
  skuId: mongoose.Types.ObjectId
  expectedQuantity: number
  unit: "kg" | "g" | "l" | "ml" | "unit"
  isPrimary: boolean
}

export interface IInventoryRecipeDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  type: "production" | "portioning" | "cooking"
  inputs: IRecipeInputDocument[]
  outputs: IRecipeOutputDocument[]
  expectedWastePct: number
  version: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const RecipeInputSchema = new Schema<IRecipeInputDocument>(
  {
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "InventorySKU",
      required: true,
    },
    quantity: { type: Number, required: true },
    unit: {
      type: String,
      enum: ["kg", "g", "l", "ml", "unit"],
      required: true,
    },
    yieldPrior: {
      alpha: { type: Number, required: true },
      beta: { type: Number, required: true },
    },
    yieldObservedMean: { type: Number, default: null },
    yieldObservationsCount: { type: Number, default: 0 },
  },
  { _id: false }
)

const RecipeOutputSchema = new Schema<IRecipeOutputDocument>(
  {
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "InventorySKU",
      required: true,
    },
    expectedQuantity: { type: Number, required: true },
    unit: {
      type: String,
      enum: ["kg", "g", "l", "ml", "unit"],
      required: true,
    },
    isPrimary: { type: Boolean, default: true },
  },
  { _id: false }
)

const InventoryRecipeSchema = new Schema<IInventoryRecipeDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["production", "portioning", "cooking"],
      required: true,
    },
    inputs: { type: [RecipeInputSchema], default: [] },
    outputs: { type: [RecipeOutputSchema], default: [] },
    expectedWastePct: { type: Number, default: 0, min: 0, max: 1 },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

InventoryRecipeSchema.index({ tenantId: 1, isActive: 1 })

export const InventoryRecipeModel = mongoose.model<IInventoryRecipeDocument>(
  "InventoryRecipe",
  InventoryRecipeSchema,
  "inventory_recipes"
)
