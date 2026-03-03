import mongoose, { Schema, Document } from 'mongoose'

export type PrinterRole = 'kitchen' | 'bar' | 'cashier'
export type PrinterStatus = 'ok' | 'error' | 'offline' | 'unknown'

export interface IPrinter extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  uid: string
  name: string
  ip: string
  port: number
  roles: PrinterRole[]
  paperWidth: 58 | 80
  isActive: boolean
  lastStatus: PrinterStatus
  lastError: string
  lastPrintAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const PrinterSchema = new Schema<IPrinter>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
      index: true,
    },
    uid: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ip: {
      type: String,
      required: true,
      trim: true,
    },
    port: {
      type: Number,
      default: 9100,
    },
    roles: {
      type: [String],
      enum: ['kitchen', 'bar', 'cashier'],
      default: ['kitchen'],
    },
    paperWidth: {
      type: Number,
      enum: [58, 80],
      default: 80,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastStatus: {
      type: String,
      enum: ['ok', 'error', 'offline', 'unknown'],
      default: 'unknown',
    },
    lastError: {
      type: String,
      default: '',
    },
    lastPrintAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

PrinterSchema.index({ tenantId: 1, locationId: 1 })

const Printer = mongoose.models.Printer || mongoose.model<IPrinter>('Printer', PrinterSchema)
export default Printer
