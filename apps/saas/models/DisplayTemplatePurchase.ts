import mongoose, { Schema } from 'mongoose'

// ============================================================================
// DisplayTemplatePurchase — desbloqueo de plantillas Premium de Display Studio
// ============================================================================
// Una fila por comercio y plantilla. En TakeasyGO cada marca es un Tenant: el
// desbloqueo es por tenantId y lo heredan todas sus sedes.
//   pending  → se inició el pago (monto en pesos congelado)
//   approved → plantilla desbloqueada (con comprobante interno DS-000001)
//   refunded → devolución/contracargo o retiro manual: vuelve a bloquearse (las
//              piezas quedan guardadas y el manifiesto deja de mostrarlas)
// source: 'mercadopago' o 'manual' (la otorga el SuperAdmin: pilotos, cortesías).
// Del pago solo se guarda el id de operación de MP: nada del pagador.
// ============================================================================

export type PurchaseStatus = 'pending' | 'approved' | 'refunded'

export interface IDisplayTemplatePurchase {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  templateId: string
  status: PurchaseStatus
  source: 'mercadopago' | 'manual'
  /** Centavos de pesos congelados al iniciar el pago (0 si es manual). */
  amountArs: number
  /** Precio de lista en dólares. */
  amountUsd: number
  /** Pesos por dólar usados para el cobro. */
  rate: number
  mpPaymentId: string | null
  purchasedBy: mongoose.Types.ObjectId | null
  grantedBy: mongoose.Types.ObjectId | null
  approvedAt: Date | null
  /** Comprobante interno (no es factura). */
  receiptNumber: number | null
  receiptIssuedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const DisplayTemplatePurchaseSchema = new Schema<IDisplayTemplatePurchase>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    templateId: { type: String, required: true, maxlength: 60 },
    status: { type: String, enum: ['pending', 'approved', 'refunded'], required: true, default: 'pending' },
    source: { type: String, enum: ['mercadopago', 'manual'], required: true },
    amountArs: { type: Number, min: 0, default: 0 },
    amountUsd: { type: Number, min: 0, default: 0 },
    rate: { type: Number, min: 0, default: 0 },
    mpPaymentId: { type: String, default: null, maxlength: 40 },
    purchasedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    receiptNumber: { type: Number, default: null },
    receiptIssuedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

DisplayTemplatePurchaseSchema.index({ tenantId: 1, templateId: 1 }, { unique: true })
DisplayTemplatePurchaseSchema.index({ receiptNumber: 1 }, { unique: true, partialFilterExpression: { receiptNumber: { $type: 'number' } } })

const DisplayTemplatePurchase =
  (mongoose.models.DisplayTemplatePurchase as mongoose.Model<IDisplayTemplatePurchase>) ||
  mongoose.model<IDisplayTemplatePurchase>('DisplayTemplatePurchase', DisplayTemplatePurchaseSchema)
export default DisplayTemplatePurchase

/** Plantillas Premium desbloqueadas por el comercio. */
export async function unlockedTemplateIds(tenantId: unknown): Promise<Set<string>> {
  const rows = await DisplayTemplatePurchase.find({ tenantId: new mongoose.Types.ObjectId(String(tenantId)), status: 'approved' }).select('templateId').lean()
  return new Set(rows.map((r) => r.templateId))
}

// ── Estado chico de Studio: contador de comprobantes, última cotización y uso de «Quitar fondo HD» ──
export interface IDisplayStudioState { _id: string; seq: number; value: number; at: Date | null }
const DisplayStudioStateSchema = new Schema<IDisplayStudioState>(
  { _id: { type: String }, seq: { type: Number, default: 0 }, value: { type: Number, default: 0 }, at: { type: Date, default: null } },
  { versionKey: false },
)
export const DisplayStudioState =
  (mongoose.models.DisplayStudioState as mongoose.Model<IDisplayStudioState>) ||
  mongoose.model<IDisplayStudioState>('DisplayStudioState', DisplayStudioStateSchema)

/** Próximo número de comprobante (atómico). */
export async function nextReceiptNumber(): Promise<number> {
  const r = await DisplayStudioState.findOneAndUpdate({ _id: 'receipt' }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean()
  return r!.seq
}

export const formatReceipt = (n: number | null | undefined) => (n ? `DS-${String(n).padStart(6, '0')}` : null)
