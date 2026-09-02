import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// InventoryStorageLocationModel — Almacenes/ubicaciones de stock
// FASE04 §3.2 — Colección: inventory_storage_locations
// ============================================================================

export interface IInventoryStorageLocationDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  name: string
  type: "cold_storage" | "dry_storage" | "bar" | "kitchen" | "other"
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const InventoryStorageLocationSchema =
  new Schema<IInventoryStorageLocationDocument>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
      },
      locationId: {
        type: Schema.Types.ObjectId,
        ref: "Location",
        required: true,
      },
      name: { type: String, required: true },
      type: {
        type: String,
        enum: ["cold_storage", "dry_storage", "bar", "kitchen", "other"],
        required: true,
      },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
  )

InventoryStorageLocationSchema.index({ tenantId: 1, isActive: 1 })

export const InventoryStorageLocationModel =
  mongoose.model<IInventoryStorageLocationDocument>(
    "InventoryStorageLocation",
    InventoryStorageLocationSchema,
    "inventory_storage_locations"
  )
