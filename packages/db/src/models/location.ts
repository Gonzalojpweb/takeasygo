import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// LocationModel — Light-read model for the `locations` collection
// Matches the schema defined in apps/saas/models/Location.ts
// Used by the sync layer to:
//   1. Validate the POS locationId claim on /auth/login
//   2. Serve GET /api/v1/locations for the POS sede picker
//   3. Track POS heartbeat (pos.lastSeenAt) for the E gate
// ============================================================================

export interface ILocationDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  isActive: boolean
  status: "active" | "paused"
  settings?: {
    acceptsOrders?: boolean
    orderModes?: string[]
  }
  pos?: {
    lastSeenAt?: Date
  }
  createdAt: Date
  updatedAt: Date
}

const LocationSchema = new Schema<ILocationDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "paused"], default: "active" },
    settings: {
      acceptsOrders: { type: Boolean, default: true },
      orderModes: { type: [String], default: ["takeaway"] },
    },
    pos: {
      lastSeenAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
)

export const LocationModel = mongoose.model<ILocationDocument>(
  "Location",
  LocationSchema,
  "locations"
)