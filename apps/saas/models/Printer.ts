import mongoose, { Schema, Document } from 'mongoose'

export type PrinterRole = 'kitchen' | 'bar' | 'cashier'

/**
 * Documentos que puede imprimir una impresora. Copia de PRINTER_DOCUMENTS
 * (packages/business/src/printing.ts) para que el modelo no dependa del
 * barrel de business; el test shared-surfaces verifica que coincidan.
 */
export const PRINTER_DOCUMENT_VALUES = ['comanda', 'ticket', 'precuenta', 'factura', 'nota_credito', 'reporte_caja'] as const
export type PrinterDocument = (typeof PRINTER_DOCUMENT_VALUES)[number]
export type PrinterStatus = 'ok' | 'error' | 'offline' | 'unknown'
export type PrinterConnectionType = 'tcp' | 'usb'

export interface IPrinter extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  uid: string
  name: string
  connectionType: PrinterConnectionType
  ip: string
  port: number
  roles: PrinterRole[]
  /**
   * Qué documentos imprime (business/printing). Vacío = los de su rol
   * (compatibilidad con impresoras anteriores a la Fase 1, 29/10).
   */
  documents: PrinterDocument[]
  paperWidth: 58 | 80
  isActive: boolean
  lastStatus: PrinterStatus
  lastError: string
  lastPrintAt: Date | null
  printSettings: PrintSettings
  createdAt: Date
  updatedAt: Date
}

export interface PrintSettings {
  kitchen: RolePrintSettings
  bar: RolePrintSettings
  cashier: RolePrintSettings
}

export interface RolePrintSettings {
  mode?: 'text' | 'image'
  fontSize: 'normal' | 'large' | 'double' | 'triple'
  lineSpacing: number
  showDescriptions: boolean
  showPrices: boolean
  showCategory: boolean
  showCustomerInfo: boolean
  showOrderNotes: boolean
  showTotal: boolean
  headerTemplate?: string
  footerTemplate?: string
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
    connectionType: {
      type: String,
      enum: ['tcp', 'usb'],
      default: 'tcp',
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
    documents: {
      type: [String],
      enum: PRINTER_DOCUMENT_VALUES,
      default: [],
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
    printSettings: {
      type: {
        kitchen: {
          type: {
            mode: { type: String, enum: ['text', 'image'], default: 'text' },
            fontSize: { type: String, enum: ['normal', 'large', 'double', 'triple'], default: 'large' },
            lineSpacing: { type: Number, default: 48 },
            showDescriptions: { type: Boolean, default: false },
            showPrices: { type: Boolean, default: false },
            showCategory: { type: Boolean, default: true },
            showCustomerInfo: { type: Boolean, default: true },
            showOrderNotes: { type: Boolean, default: true },
            showTotal: { type: Boolean, default: false },
            headerTemplate: { type: String, default: '' },
            footerTemplate: { type: String, default: '' },
          },
          default: {},
        },
        bar: {
          type: {
            mode: { type: String, enum: ['text', 'image'], default: 'text' },
            fontSize: { type: String, enum: ['normal', 'large', 'double', 'triple'], default: 'large' },
            lineSpacing: { type: Number, default: 48 },
            showDescriptions: { type: Boolean, default: false },
            showPrices: { type: Boolean, default: false },
            showCategory: { type: Boolean, default: true },
            showCustomerInfo: { type: Boolean, default: true },
            showOrderNotes: { type: Boolean, default: true },
            showTotal: { type: Boolean, default: false },
            headerTemplate: { type: String, default: '' },
            footerTemplate: { type: String, default: '' },
          },
          default: {},
        },
        cashier: {
          type: {
            mode: { type: String, enum: ['text', 'image'], default: 'text' },
            fontSize: { type: String, enum: ['normal', 'large', 'double', 'triple'], default: 'normal' },
            lineSpacing: { type: Number, default: 36 },
            showDescriptions: { type: Boolean, default: true },
            showPrices: { type: Boolean, default: true },
            showCategory: { type: Boolean, default: true },
            showCustomerInfo: { type: Boolean, default: true },
            showOrderNotes: { type: Boolean, default: true },
            showTotal: { type: Boolean, default: true },
            headerTemplate: { type: String, default: '' },
            footerTemplate: { type: String, default: '' },
          },
          default: {},
        },
      },
      default: {
        kitchen: {
          mode: 'text',
          fontSize: 'large',
          lineSpacing: 48,
          showDescriptions: false,
          showPrices: false,
          showCategory: true,
          showCustomerInfo: true,
          showOrderNotes: true,
          showTotal: false,
        },
        bar: {
          mode: 'text',
          fontSize: 'large',
          lineSpacing: 48,
          showDescriptions: false,
          showPrices: false,
          showCategory: true,
          showCustomerInfo: true,
          showOrderNotes: true,
          showTotal: false,
        },
        cashier: {
          mode: 'text',
          fontSize: 'normal',
          lineSpacing: 36,
          showDescriptions: true,
          showPrices: true,
          showCategory: true,
          showCustomerInfo: true,
          showOrderNotes: true,
          showTotal: true,
        },
      },
    },
  },
  {
    timestamps: true,
  }
)

PrinterSchema.index({ tenantId: 1, locationId: 1 })

const Printer = mongoose.models.Printer || mongoose.model<IPrinter>('Printer', PrinterSchema)
export default Printer
