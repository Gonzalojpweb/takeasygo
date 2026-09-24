import mongoose, { Schema, type Document } from "mongoose"

export interface ISlaRule {
  fromStatus: string
  toStatus: string
  slaMinutes: number
  level1Minutes: number
  level2Minutes: number
  level3Minutes: number
  orderMode: "all" | "takeaway" | "delivery" | "dine-in" | "business"
}

export interface IComplianceConfigDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  /** ObjectId de la sede. null = default global del tenant. */
  locationId: mongoose.Types.ObjectId | null
  slaRules: ISlaRule[]
  enabled: boolean
  /** Solo nivel 1+2, sin bloqueo L3. Para piloto. */
  pilotMode: boolean
  createdAt: Date
  updatedAt: Date
}

const SlaRuleSchema = new Schema<ISlaRule>(
  {
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    slaMinutes: { type: Number, required: true },
    level1Minutes: { type: Number, required: true },
    level2Minutes: { type: Number, required: true },
    level3Minutes: { type: Number, required: true },
    orderMode: {
      type: String,
      required: true,
      enum: ["all", "takeaway", "delivery", "dine-in", "business"],
      default: "all",
    },
  },
  { _id: false }
)

export const ComplianceConfigSchema = new Schema<IComplianceConfigDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Tenant",
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    slaRules: { type: [SlaRuleSchema], default: [] },
    enabled: { type: Boolean, default: true },
    pilotMode: { type: Boolean, default: false },
  },
  { timestamps: true }
)

ComplianceConfigSchema.index({ tenantId: 1, locationId: 1 }, { unique: true })

export const ComplianceConfigModel =
  (mongoose.models.ComplianceConfig as mongoose.Model<IComplianceConfigDocument>) ||
  mongoose.model<IComplianceConfigDocument>(
    "ComplianceConfig",
    ComplianceConfigSchema,
    "compliance_configs"
  )

/** SLA defaults para cuando no hay configuración explícita */
export const DEFAULT_SLA_RULES: ISlaRule[] = [
  {
    fromStatus: "pending",
    toStatus: "confirmed",
    slaMinutes: 5,
    level1Minutes: 3,
    level2Minutes: 5,
    level3Minutes: 10,
    orderMode: "all",
  },
  {
    fromStatus: "confirmed",
    toStatus: "preparing",
    slaMinutes: 10,
    level1Minutes: 7,
    level2Minutes: 12,
    level3Minutes: 20,
    orderMode: "all",
  },
  {
    fromStatus: "preparing",
    toStatus: "ready",
    slaMinutes: 60,
    level1Minutes: 45,
    level2Minutes: 60,
    level3Minutes: 90,
    orderMode: "all",
  },
  {
    fromStatus: "ready",
    toStatus: "en_ruta",
    slaMinutes: 1440,
    level1Minutes: 120,
    level2Minutes: 360,
    level3Minutes: 1440,
    orderMode: "delivery",
  },
  {
    fromStatus: "ready",
    toStatus: "delivered",
    slaMinutes: 1440,
    level1Minutes: 120,
    level2Minutes: 360,
    level3Minutes: 1440,
    orderMode: "takeaway",
  },
]
