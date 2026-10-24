import mongoose, { Schema, Document } from 'mongoose'
import type { FiscalEnvironment } from './FiscalProfile'

// ============================================================================
// FiscalDocument — comprobante electrónico (factura o nota de crédito)
// ============================================================================
// Fase 5 de caja (2026-10). Docs: ADMIN/FASE5_COMPROBANTES_NC_LIBRO_IVA.md.
//
//   · Un documento por hecho: `idempotencyKey` único por comercio
//     (`invoice:<orderId>`, `credit:<orderId>`). Un reintento nunca emite dos.
//   · Inmutable una vez autorizado: CAE, número, montos y líneas congelados
//     tal como se informaron a ARCA (las alícuotas de la carta pueden cambiar
//     después; el comprobante no).
//   · `reservedNumber`: número pedido a ARCA en un intento que no terminó
//     (timeout). Antes de pedir otro se consulta si ese quedó autorizado:
//     así no hay duplicados ni huecos.
//   · Montos en centavos.
// ============================================================================

export type FiscalDocumentStatus = 'pending' | 'authorized' | 'rejected' | 'retrying'
export type FiscalDocumentKind = 'invoice' | 'credit_note'
export type InvoiceLetterValue = 'A' | 'B' | 'C'
export type ReceiverCondition = 'consumidor_final' | 'responsable_inscripto' | 'monotributo' | 'exento' | 'no_categorizado'

export interface IFiscalDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  orderPosId: string | null
  orderNumber: string | null
  kind: FiscalDocumentKind
  letter: InvoiceLetterValue
  cbteTipo: number
  pointOfSale: number
  environment: FiscalEnvironment
  status: FiscalDocumentStatus
  number: number | null
  reservedNumber: number | null
  issuedAt: Date
  receiver: {
    condition: ReceiverCondition
    /** 99 consumidor final · 80 CUIT · 96 DNI */
    docType: number
    docNumber: string
    name: string
  }
  amounts: { totalCents: number; netCents: number; ivaCents: number; exemptCents: number }
  ivaGroups: { ivaRate: number; afipId: number; baseCents: number; amountCents: number }[]
  lines: { description: string; quantity: number; totalCents: number; ivaRate: number }[]
  cae: string | null
  caeExpiresAt: Date | null
  /** 'cae' (online) o 'caea' (contingencia: se informa a ARCA después). Fase 6. */
  authMode: 'cae' | 'caea'
  /** CAEA: ya informado a ARCA con FECAEARegInformativo. */
  caeaInformedAt: Date | null
  qrUrl: string | null
  associated: {
    documentId: mongoose.Types.ObjectId
    cbteTipo: number
    pointOfSale: number
    number: number
    issuedAt: Date
  } | null
  arca: {
    attempts: number
    lastAttemptAt: Date | null
    lastError: string
    observations: { code: string; message: string }[]
  }
  idempotencyKey: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const MessageSchema = new Schema({ code: String, message: String }, { _id: false })

const FiscalDocumentSchema = new Schema<IFiscalDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderPosId: { type: String, default: null },
    orderNumber: { type: String, default: null },
    kind: { type: String, enum: ['invoice', 'credit_note'], required: true },
    letter: { type: String, enum: ['A', 'B', 'C'], required: true },
    cbteTipo: { type: Number, required: true },
    pointOfSale: { type: Number, required: true, min: 1, max: 99998 },
    environment: { type: String, enum: ['homologation', 'production'], required: true },
    status: { type: String, enum: ['pending', 'authorized', 'rejected', 'retrying'], default: 'pending' },
    number: { type: Number, default: null },
    reservedNumber: { type: Number, default: null },
    issuedAt: { type: Date, required: true },
    receiver: {
      condition: {
        type: String,
        enum: ['consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_categorizado'],
        required: true,
      },
      docType: { type: Number, required: true },
      docNumber: { type: String, required: true, maxlength: 11 },
      name: { type: String, default: '', maxlength: 120 },
    },
    amounts: {
      totalCents: { type: Number, required: true, min: 0 },
      netCents: { type: Number, required: true, min: 0 },
      ivaCents: { type: Number, required: true, min: 0 },
      exemptCents: { type: Number, required: true, min: 0 },
    },
    ivaGroups: [
      {
        _id: false,
        ivaRate: Number,
        afipId: Number,
        baseCents: Number,
        amountCents: Number,
      },
    ],
    lines: [
      {
        _id: false,
        description: { type: String, maxlength: 200 },
        quantity: Number,
        totalCents: Number,
        ivaRate: Number,
      },
    ],
    cae: { type: String, default: null },
    caeExpiresAt: { type: Date, default: null },
    authMode: { type: String, enum: ['cae', 'caea'], default: 'cae' },
    caeaInformedAt: { type: Date, default: null },
    qrUrl: { type: String, default: null },
    associated: {
      type: new Schema(
        {
          documentId: { type: Schema.Types.ObjectId, ref: 'FiscalDocument', required: true },
          cbteTipo: { type: Number, required: true },
          pointOfSale: { type: Number, required: true },
          number: { type: Number, required: true },
          issuedAt: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    arca: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date, default: null },
      lastError: { type: String, default: '', maxlength: 500 },
      observations: { type: [MessageSchema], default: [] },
    },
    idempotencyKey: { type: String, required: true, maxlength: 120 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
)

// Un comprobante por hecho (reintentos idempotentes).
FiscalDocumentSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
// Numeración: nunca dos comprobantes autorizados con el mismo número.
FiscalDocumentSchema.index(
  { tenantId: 1, environment: 1, pointOfSale: 1, cbteTipo: 1, number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'number' } } }
)
// Libro IVA y listado del panel.
FiscalDocumentSchema.index({ tenantId: 1, environment: 1, issuedAt: -1 })
// Reintentos pendientes (cron).
FiscalDocumentSchema.index({ status: 1, updatedAt: 1 })
// Comprobantes de una orden.
FiscalDocumentSchema.index({ tenantId: 1, orderId: 1 })
// CAEA pendientes de informar (cron).
FiscalDocumentSchema.index({ authMode: 1, caeaInformedAt: 1, status: 1 })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'FiscalDocument')
}

const FiscalDocument =
  (mongoose.models.FiscalDocument as mongoose.Model<IFiscalDocument>) ||
  mongoose.model<IFiscalDocument>('FiscalDocument', FiscalDocumentSchema)

export default FiscalDocument
