import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// FiscalControllerJob — operación fiscal en un CONTROLADOR FISCAL homologado
// ============================================================================
// Orden de ejecución 31/10 (fase 3). Es un circuito DISTINTO de la factura
// electrónica (FiscalDocument + ARCA):
//
//   · FiscalDocument       comprobante electrónico autorizado por ARCA (CAE).
//   · PreClosePrintJob     representación impresa (ticket) en una térmica.
//   · FiscalControllerJob  comprobante que EMITE el controlador fiscal: el
//                          número y la validez fiscal los da el equipo.
//
// La operación viaja al agente local (Windows), que la ejecuta con el driver
// del fabricante. Ciclo de vida (lib/fiscal/controller.ts):
//
//   pending → claimed → sending → confirmed      (el equipo informó número)
//                              → failed          (seguro: el equipo NO emitió)
//                              → unknown         (pudo emitir: NUNCA se
//                                                 reintenta solo; se reconcilia
//                                                 consultando el equipo)
//   driver_unavailable: no hay driver del fabricante instalado/validado.
//
// Idempotencia: una operación por hecho (`idempotencyKey`, p. ej.
// `controller:invoice:<orderId>`). Una venta NO puede tener a la vez factura
// electrónica y comprobante de controlador (lo impide lib/fiscal/controller).
// ============================================================================

export type ControllerJobStatus =
  | 'pending'
  | 'claimed'
  | 'sending'
  | 'confirmed'
  | 'failed'
  | 'unknown'
  | 'driver_unavailable'
  | 'cancelled'

export interface IFiscalControllerJob extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  operation: 'invoice' | 'credit_note' | 'status' | 'query_last'
  /** Equipo configurado en el perfil (copia: si se cambia, la operación no se mueve). */
  device: { brand: string; model: string; firmware: string; connection: string; address: string }
  /** Datos de la venta a emitir (sin datos sensibles más allá de lo fiscal). */
  payload: {
    receiver: { condition: string; docType: number; docNumber: string; name: string }
    lines: { description: string; quantity: number; unitPriceCents: number; ivaRate: number }[]
    totalCents: number
    discountCents: number
    payments: { method: string; amountCents: number }[]
  } | null
  status: ControllerJobStatus
  /** Resultado informado por el equipo. */
  result: {
    documentType: string | null
    pointOfSale: number | null
    number: number | null
    issuedAt: Date | null
    totalCents: number | null
    raw: string
  }
  attempts: number
  claimId: string | null
  claimExpiresAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  lastError: string
  agentVersion: string | null
  idempotencyKey: string
  createdBy: string
  resolvedBy: string | null
  createdAt: Date
  updatedAt: Date
}

const FiscalControllerJobSchema = new Schema<IFiscalControllerJob>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    operation: { type: String, enum: ['invoice', 'credit_note', 'status', 'query_last'], required: true },
    device: {
      brand: { type: String, required: true, maxlength: 40 },
      model: { type: String, default: '', maxlength: 60 },
      firmware: { type: String, default: '', maxlength: 40 },
      connection: { type: String, default: '', maxlength: 20 },
      address: { type: String, default: '', maxlength: 120 },
    },
    payload: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ['pending', 'claimed', 'sending', 'confirmed', 'failed', 'unknown', 'driver_unavailable', 'cancelled'],
      default: 'pending',
    },
    result: {
      documentType: { type: String, default: null },
      pointOfSale: { type: Number, default: null },
      number: { type: Number, default: null },
      issuedAt: { type: Date, default: null },
      totalCents: { type: Number, default: null },
      raw: { type: String, default: '', maxlength: 2000 },
    },
    attempts: { type: Number, default: 0 },
    claimId: { type: String, default: null },
    claimExpiresAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: '', maxlength: 500 },
    agentVersion: { type: String, default: null },
    idempotencyKey: { type: String, required: true, maxlength: 120 },
    createdBy: { type: String, required: true },
    resolvedBy: { type: String, default: null },
  },
  { timestamps: true }
)

FiscalControllerJobSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
FiscalControllerJobSchema.index({ tenantId: 1, locationId: 1, status: 1, createdAt: 1 })
FiscalControllerJobSchema.index({ tenantId: 1, orderId: 1 })

const FiscalControllerJob =
  (mongoose.models.FiscalControllerJob as mongoose.Model<IFiscalControllerJob>) ||
  mongoose.model<IFiscalControllerJob>('FiscalControllerJob', FiscalControllerJobSchema)
export default FiscalControllerJob
