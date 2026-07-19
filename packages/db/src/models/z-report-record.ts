import mongoose, { Schema, type Document } from "mongoose"

export interface ZReportRecordDocument extends Document {
  registerId: string
  tenantId: string
  cashierName: string
  closedAt: Date
  zReport: Record<string, unknown>
  shareToken: string
  createdAt: Date
}

export const ZReportRecordSchema = new Schema<ZReportRecordDocument>(
  {
    registerId: { type: String, required: true },
    tenantId: { type: String, required: true },
    cashierName: { type: String, required: true },
    closedAt: { type: Date, required: true },
    zReport: { type: Schema.Types.Mixed, required: true },
    shareToken: { type: String, required: true },
  },
  { timestamps: true }
)

ZReportRecordSchema.index({ shareToken: 1 }, { unique: true })
ZReportRecordSchema.index({ tenantId: 1, closedAt: -1 })
ZReportRecordSchema.index({ registerId: 1 }, { unique: true })

export const ZReportRecordModel = mongoose.model<ZReportRecordDocument>(
  "ZReportRecord",
  ZReportRecordSchema,
  "z_report_records"
)
