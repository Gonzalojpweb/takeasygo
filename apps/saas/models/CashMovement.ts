import mongoose, { Schema, Document } from 'mongoose'
import type { CashChannel, CashMovementType, PaymentMethod } from '@takeasygo/types'

// ============================================================================
// CashMovement — movimientos de caja del POS Online (V1)
// ============================================================================
// Colección SEPARADA (no embebida en CashRegister) para que:
//   - la idempotencia sea un índice único en DB, no una búsqueda lineal;
//   - el Z report consulte por registerId sin cargar cajas gigantes;
//   - la auditoría de dinero quede normalizada.
//
// El contrato del POS expone `CashRegister.movements` embebido: el mapper
// (apps/saas/lib/pos/*) es quien arma ese array al leer. Es intencional —
// el wire format del POS no cambia, solo la persistencia.
//
// Reglas (Consenso v1) — NO reimplementar, usar @takeasygo/business/cash:
//   §1    arqueo: cashExpectedDelta(type, paymentMethod, amount)
//   §2.1  idempotencia: mismo (registerId, relatedOrderId, type) = mismo hecho
// ============================================================================

export interface ICashMovement extends Document {
  posId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  registerId: mongoose.Types.ObjectId
  type: CashMovementType
  /** Monto SIEMPRE positivo, en centavos. El signo lo aplica cashExpectedDelta. @storedAs cents */
  amount: number
  reason: string
  userId: string
  timestamp: Date
  /** posId de la orden relacionada — clave de idempotencia. */
  relatedOrderId: string | null
  channel: CashChannel
  paymentMethod: PaymentMethod
  createdAt: Date
  updatedAt: Date
}

const CashMovementSchema = new Schema<ICashMovement>(
  {
    posId: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    registerId: { type: Schema.Types.ObjectId, ref: 'CashRegister', required: true, index: true },
    type: {
      type: String,
      enum: [
        'income',
        'expense',
        'withdrawal',
        'deposit',
        'sale',
        'refund',
        'cash_order_not_collected',
      ] as CashMovementType[],
      required: true,
    },
    /** @storedAs cents */
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    userId: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    relatedOrderId: { type: String, default: null },
    channel: { type: String, enum: ['counter', 'takeasygo'] as CashChannel[], required: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'mercadopago', 'posnet_debit', 'posnet_credit', 'kripton', 'transfer'] as PaymentMethod[],
      required: true,
    },
  },
  { timestamps: true }
)

// Idempotencia de escritura: el id lo genera el POS.
CashMovementSchema.index({ tenantId: 1, posId: 1 }, { unique: true })

// ── Idempotencia de negocio (Consenso v1 §2.1) ───────────────────────────────
// Mismo (registerId, relatedOrderId, type) ⇒ mismo hecho de negocio.
// El server debe devolver el existente y NO duplicar cuando el POS reintenta.
// `relatedOrderId` solo existe cuando el movimiento está ligado a una orden;
// los movimientos manuales (sin orden) quedan fuera del filtro y sí pueden repetirse.
CashMovementSchema.index(
  { registerId: 1, relatedOrderId: 1, type: 1 },
  { unique: true, partialFilterExpression: { relatedOrderId: { $type: 'string' } } }
)

// Lecturas: Z report por caja y auditoría por tenant/rango.
CashMovementSchema.index({ registerId: 1, timestamp: 1 })
CashMovementSchema.index({ tenantId: 1, timestamp: -1 })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'CashMovement')
}

const CashMovement =
  (mongoose.models.CashMovement as mongoose.Model<ICashMovement>) ||
  mongoose.model<ICashMovement>('CashMovement', CashMovementSchema)

export default CashMovement
