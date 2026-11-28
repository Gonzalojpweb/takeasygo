import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkSettlement — liquidación semanal de comisiones de red (etapa 6)
// ============================================================================
// Informe 21/11/2026, §4.4, §4.5 y §10:
//   · Una liquidación por comercio receptor y semana (lunes a lunes, hora de
//     Argentina). Suma los movimientos del libro (comisiones y reversiones)
//     de esa semana que todavía no estaban liquidados.
//   · El libro no se modifica: qué movimiento entró en qué liquidación lo
//     registra NetworkSettlementLine (un movimiento, una sola liquidación).
//   · autoCollectedCents: lo que ya se cobró solo (split de Mercado Pago,
//     cuando exista); dueCents: lo que el comercio tiene que transferir.
//   · Los pagos los registra el superadmin (solo se agregan) y la conciliación
//     queda en el historial.
// Importes en centavos.
// ============================================================================

export interface ISettlementPayment {
  at: Date
  amountCents: number
  method: 'transfer' | 'cash' | 'other'
  reference: string
  recordedBy: string
}

export interface INetworkSettlement {
  _id: Types.ObjectId
  receiverTenantId: Types.ObjectId
  periodStart: Date
  periodEnd: Date
  status: 'issued' | 'partially_paid' | 'paid' | 'void'
  entries: number
  /** Comisión neta del período (comisiones − reversiones). @storedAs cents */
  commissionCents: number
  /** Cobrado automáticamente (split). @storedAs cents */
  autoCollectedCents: number
  /** A transferir por el comercio. @storedAs cents */
  dueCents: number
  /** Pagado hasta ahora. @storedAs cents */
  paidCents: number
  payments: ISettlementPayment[]
  issuedAt: Date
  paidAt: Date | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const PaymentSchema = new Schema<ISettlementPayment>({
  at: { type: Date, required: true },
  amountCents: { type: Number, required: true },
  method: { type: String, enum: ['transfer', 'cash', 'other'], required: true },
  reference: { type: String, default: '', maxlength: 120 },
  recordedBy: { type: String, required: true },
}, { _id: false })

const NetworkSettlementSchema = new Schema<INetworkSettlement>({
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ['issued', 'partially_paid', 'paid', 'void'], default: 'issued' },
  entries: { type: Number, default: 0 },
  commissionCents: { type: Number, required: true },
  autoCollectedCents: { type: Number, default: 0 },
  dueCents: { type: Number, required: true },
  paidCents: { type: Number, default: 0 },
  payments: { type: [PaymentSchema], default: [] },
  issuedAt: { type: Date, required: true },
  paidAt: { type: Date, default: null },
  createdBy: { type: String, required: true },
}, { timestamps: true })

NetworkSettlementSchema.index({ receiverTenantId: 1, periodStart: 1 }, { unique: true })
NetworkSettlementSchema.index({ status: 1, receiverTenantId: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkSettlement
const NetworkSettlement = mongoose.models.NetworkSettlement || mongoose.model<INetworkSettlement>('NetworkSettlement', NetworkSettlementSchema, 'network_settlements')
export default NetworkSettlement
