import mongoose, { Schema, Document } from 'mongoose'
import type { CashChannel, CashRegisterStatus } from '@takeasygo/types'

// ============================================================================
// CashRegister — cajas del POS Online (V1)
// ============================================================================
// Fuente de verdad del servidor. Reglas de negocio que este modelo DEBE
// respetar (todas ya implementadas hoy en apps/pos/src/services/cash.ts):
//
// §1  expectedAmount (arqueo) suma SOLO movimientos en efectivo. La regla
//     pura vive en cashExpectedDelta() de @takeasygo/business — no re-implementarla.
// §2.1 Idempotencia de movimientos: (registerId, relatedOrderId, type) único.
//      Se impone además en DB vía CashMovement (índice parcial).
// §2.3 defaultForChannel — routing multi-caja.
// §3   zReport es un snapshot inmutable generado UNA VEZ al cerrar. Nunca se
//      recalcula; PDF e impresión leen exclusivamente de este objeto.
// §4   shareToken — link compartible de alta entropía.
//
// UNA caja abierta por (tenant, location): ver nota en la sección de índices.
// ============================================================================

export interface ICashRegister extends Document {
  posId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  openedBy: string
  closedBy: string | null
  openedAt: Date
  closedAt: Date | null
  /** Monto inicial en centavos. @storedAs cents */
  initialAmount: number
  /** Conteo físico al cerrar, en centavos. @storedAs cents */
  finalAmount: number | null
  /** Arqueo esperado en centavos. @storedAs cents */
  expectedAmount: number
  /** finalAmount - expectedAmount, en centavos. @storedAs cents */
  difference: number | null
  status: CashRegisterStatus
  defaultForChannel: CashChannel | null
  /** Snapshot inmutable (ZReport). Mixed a propósito: no se castea ni se recalcula. */
  zReport: Record<string, unknown> | null
  shareToken: string | null
  createdAt: Date
  updatedAt: Date
}

const CashRegisterSchema = new Schema<ICashRegister>(
  {
    posId: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    openedBy: { type: String, required: true },
    closedBy: { type: String, default: null },
    openedAt: { type: Date, required: true, default: Date.now },
    closedAt: { type: Date, default: null },
    /** @storedAs cents */
    initialAmount: { type: Number, required: true, min: 0 },
    /** @storedAs cents */
    finalAmount: { type: Number, default: null },
    /** @storedAs cents — inicial en apertura, recalculado en cada movimiento. */
    expectedAmount: { type: Number, required: true, min: 0 },
    /** @storedAs cents */
    difference: { type: Number, default: null },
    status: { type: String, enum: ['open', 'closed'] as CashRegisterStatus[], default: 'open' },
    defaultForChannel: { type: String, enum: ['counter', 'takeasygo', null], default: null },
    zReport: { type: Schema.Types.Mixed, default: null },
    shareToken: { type: String, default: null },
  },
  { timestamps: true }
)

// Idempotencia: el id lo genera el POS, un reintento no debe crear otra caja.
CashRegisterSchema.index({ tenantId: 1, posId: 1 }, { unique: true })

// UNA caja abierta por sede (Consenso v1 §2).
// Nota: apps/pos/src/services/cash.ts chequea "una caja abierta por tenant"
// contra Dexie, que solo contiene las mesas de SU sede — equivalente en
// la práctica. En el server, que ve todas las sedes, el alcance correcto es
// (tenant, location): sin esto, una segunda sede no podría abrir caja.
CashRegisterSchema.index(
  { tenantId: 1, locationId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
)

// Reporte histórico por rango (CashDashboard "historial").
CashRegisterSchema.index({ tenantId: 1, locationId: 1, status: 1, closedAt: -1 })

// Share token del Z Report (§4) — lookup directo, único entre todas las cajas.
// partialFilterExpression en vez de sparse: el token puede ser null y null
// no debe entrar al índice unique.
CashRegisterSchema.index(
  { shareToken: 1 },
  { unique: true, partialFilterExpression: { shareToken: { $type: 'string' } } }
)

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'CashRegister')
}

const CashRegister =
  (mongoose.models.CashRegister as mongoose.Model<ICashRegister>) ||
  mongoose.model<ICashRegister>('CashRegister', CashRegisterSchema)

export default CashRegister
