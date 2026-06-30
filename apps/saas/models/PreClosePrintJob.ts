import mongoose, { Schema, Document } from 'mongoose'

export interface IPreClosePrintJob extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  printerName: string
  connectionType: 'tcp' | 'usb'
  ip: string
  port: number
  paperWidth: 58 | 80
  data: string
  status: 'pending' | 'success' | 'error'
  createdAt: Date
  updatedAt: Date
}

const PreClosePrintJobSchema = new Schema<IPreClosePrintJob>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    printerName: { type: String, required: true },
    connectionType: { type: String, enum: ['tcp', 'usb'], default: 'tcp' },
    ip: { type: String, default: '' },
    port: { type: Number, default: 9100 },
    paperWidth: { type: Number, enum: [58, 80], default: 80 },
    data: { type: String, required: true },
    status: { type: String, enum: ['pending', 'success', 'error'], default: 'pending' },
  },
  { timestamps: true }
)

PreClosePrintJobSchema.index({ tenantId: 1, locationId: 1, status: 1 })

const PreClosePrintJob = mongoose.models.PreClosePrintJob || mongoose.model<IPreClosePrintJob>('PreClosePrintJob', PreClosePrintJobSchema)
export default PreClosePrintJob
