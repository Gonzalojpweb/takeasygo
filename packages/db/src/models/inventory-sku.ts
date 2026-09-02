import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// InventorySKUModel — Catálogo de ingredientes/SKUs
// FASE04 §3.1 — Colección: inventory_skus
// ============================================================================

export interface IInventorySKUDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  skuCode?: string
  category:
    | "meat_poultry"
    | "fish_seafood"
    | "vegetables"
    | "fruits"
    | "dairy"
    | "dry_goods"
    | "beverages"
    | "packaging"
    | "other"
  canonicalUnit: "kg" | "g" | "l" | "ml" | "unit"
  yieldPrior: {
    alpha: number
    beta: number
    source: "category_benchmark" | "restaurant_history"
  }
  businessImpact: "critical" | "high" | "medium" | "low"
  /** @storedAs cents */
  lastUnitCostCents: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const YieldPriorSchema = new Schema(
  {
    alpha: { type: Number, required: true },
    beta: { type: Number, required: true },
    source: {
      type: String,
      enum: ["category_benchmark", "restaurant_history"],
      required: true,
    },
  },
  { _id: false }
)

const InventorySKUSchema = new Schema<IInventorySKUDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    skuCode: { type: String, default: null },
    category: {
      type: String,
      enum: [
        "meat_poultry",
        "fish_seafood",
        "vegetables",
        "fruits",
        "dairy",
        "dry_goods",
        "beverages",
        "packaging",
        "other",
      ],
      required: true,
    },
    canonicalUnit: {
      type: String,
      enum: ["kg", "g", "l", "ml", "unit"],
      required: true,
    },
    yieldPrior: { type: YieldPriorSchema, required: true },
    businessImpact: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    lastUnitCostCents: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

InventorySKUSchema.index({ tenantId: 1, isActive: 1 })
InventorySKUSchema.index({ tenantId: 1, skuCode: 1 }, { unique: true, sparse: true })

export const InventorySKUModel = mongoose.model<IInventorySKUDocument>(
  "InventorySKU",
  InventorySKUSchema,
  "inventory_skus"
)
