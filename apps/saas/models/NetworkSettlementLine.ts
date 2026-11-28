import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkSettlementLine — qué movimiento del libro entró en qué liquidación
// ============================================================================
// El libro de la red (NetworkLedgerEntry) es inmutable: en vez de marcarlo,
// cada movimiento liquidado tiene UNA línea acá. El índice único por
// movimiento impide liquidar dos veces el mismo canje (también si dos
// generaciones corren a la vez).
// ============================================================================

export interface INetworkSettlementLine {
  _id: Types.ObjectId
  ledgerEntryId: Types.ObjectId
  settlementId: Types.ObjectId
  receiverTenantId: Types.ObjectId
  /** @storedAs cents */
  commissionCents: number
  createdAt: Date
}

const NetworkSettlementLineSchema = new Schema<INetworkSettlementLine>({
  ledgerEntryId: { type: Schema.Types.ObjectId, ref: 'NetworkLedgerEntry', required: true },
  settlementId: { type: Schema.Types.ObjectId, ref: 'NetworkSettlement', required: true },
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  commissionCents: { type: Number, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })

NetworkSettlementLineSchema.index({ ledgerEntryId: 1 }, { unique: true })
NetworkSettlementLineSchema.index({ settlementId: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkSettlementLine
const NetworkSettlementLine = mongoose.models.NetworkSettlementLine || mongoose.model<INetworkSettlementLine>('NetworkSettlementLine', NetworkSettlementLineSchema, 'network_settlement_lines')
export default NetworkSettlementLine
