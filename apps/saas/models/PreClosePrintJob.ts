import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// PreClosePrintJob — tickets que salen por la impresora de caja (pre-cierre,
// precuenta, Z, comprobante fiscal)
// ============================================================================
// Ciclo de vida (orden de ejecución 31/10, P0.2 — ver lib/printing/job-lifecycle):
//
//   pending ──(el servidor lo reserva, atómico)──▶ claimed
//   claimed ──(el agente confirma que va a imprimir)──▶ printing
//   claimed ──(la reserva vence sin confirmación)──▶ pending   (nunca se mandó)
//   printing ──▶ success   bytes entregados a la impresora (TCP) o aceptados
//                          por el spooler de Windows (USB). NO es una prueba
//                          física de impresión: ESC/POS no lo confirma.
//   printing ──▶ pending   falla SEGURA (nada llegó a la impresora), con
//                          espera; tras `maxAttempts` ⇒ error
//   printing ──▶ unknown   falla a mitad de envío o sin respuesta del agente:
//                          pudo haber impreso. NUNCA se reimprime solo; lo
//                          resuelve una persona (marcar impreso o reimprimir).
//   * ──▶ cancelled        descartado por una persona
//
// `dedupeKey` (único): el mismo hecho no genera dos trabajos (p. ej. el
// ticket original de un comprobante). Las reimpresiones llevan su propia clave
// con número correlativo y quedan auditadas.
// ============================================================================

export type PrintJobStatus = 'pending' | 'claimed' | 'printing' | 'success' | 'error' | 'unknown' | 'cancelled'
export type PrintJobKind = 'fiscal_invoice' | 'fiscal_credit_note' | 'z_report' | 'precuenta' | 'preclose' | 'other'
export type PrintOutcome = 'delivered_to_device' | 'accepted_by_spooler'

export interface IPreClosePrintJob extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  printerName: string
  connectionType: 'tcp' | 'usb'
  ip: string
  port: number
  paperWidth: 58 | 80
  data: string
  status: PrintJobStatus
  kind: PrintJobKind
  /** Comprobante fiscal que representa (si corresponde). */
  fiscalDocumentId: mongoose.Types.ObjectId | null
  isReprint: boolean
  requestedBy: string | null
  dedupeKey: string | null
  attempts: number
  maxAttempts: number
  nextAttemptAt: Date | null
  claimId: string | null
  claimedAt: Date | null
  claimExpiresAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  outcome: PrintOutcome | null
  lastError: string
  agentVersion: string | null
  resolvedBy: string | null
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
    status: {
      type: String,
      enum: ['pending', 'claimed', 'printing', 'success', 'error', 'unknown', 'cancelled'],
      default: 'pending',
    },
    kind: {
      type: String,
      enum: ['fiscal_invoice', 'fiscal_credit_note', 'z_report', 'precuenta', 'preclose', 'other'],
      default: 'other',
    },
    fiscalDocumentId: { type: Schema.Types.ObjectId, ref: 'FiscalDocument', default: null },
    isReprint: { type: Boolean, default: false },
    requestedBy: { type: String, default: null },
    dedupeKey: { type: String, default: null, maxlength: 160 },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextAttemptAt: { type: Date, default: null },
    claimId: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    claimExpiresAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    outcome: { type: String, enum: ['delivered_to_device', 'accepted_by_spooler', null], default: null },
    lastError: { type: String, default: '', maxlength: 300 },
    agentVersion: { type: String, default: null },
    resolvedBy: { type: String, default: null },
  },
  { timestamps: true }
)

PreClosePrintJobSchema.index({ tenantId: 1, locationId: 1, status: 1 })
// Un trabajo por hecho (el original de un comprobante, una reimpresión N…).
PreClosePrintJobSchema.index(
  { tenantId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
)
// Trabajos de un comprobante (estado de impresión, reimpresiones).
PreClosePrintJobSchema.index({ fiscalDocumentId: 1, createdAt: -1 })

const PreClosePrintJob =
  (mongoose.models.PreClosePrintJob as mongoose.Model<IPreClosePrintJob>) ||
  mongoose.model<IPreClosePrintJob>('PreClosePrintJob', PreClosePrintJobSchema)
export default PreClosePrintJob
