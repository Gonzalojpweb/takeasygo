import type {
  CashChannel,
  PaymentMethod,
  CashMovementType,
} from "@takeasygo/types"
import { db } from "../db/dexie"
import { addMovement, getRegisterForChannel } from "./cash"

// ============================================================================
// Sync Cash — Handler de ventas TakeasyGO → Caja
// ============================================================================
// Decisión: Consenso v1 §2 — Endpoint que recibe ventas de TakeasyGO y
// las registra automáticamente en la caja activa.
//
// Flujo:
// 1. Verificar idempotencia (no duplicar)
// 2. Mapear orderMode → CashChannel
// 3. Buscar caja target (defaultForChannel → fallback)
// 4. Si no hay caja → guardar en pendingMovements
// 5. Si hay caja → addMovement()
// ============================================================================

/**
 * Payload que llega del Sync Layer cuando se confirma un pago de TakeasyGO.
 *
 * Mapeo de orderMode del SaaS:
 *   'dine-in' | 'business' → 'counter'
 *   'takeaway' | 'delivery' → 'takeasygo'
 */
export interface TakeasyGOSalePayload {
  /** ID del evento en el outbox del Sync Layer (para ACK) */
  eventId?: string
  /** ID de la orden en el SaaS */
  orderId: string
  /** ID del tenant */
  tenantId: string
  /** Monto total de la venta */
  amount: number
  /** Método de pago usado por el cliente */
  paymentMethod: PaymentMethod
  /** Modo de orden del SaaS: 'takeaway' | 'delivery' | 'dine-in' | 'business' */
  orderMode: string
}

export type TakeasyGOSaleResult =
  | { status: "registered"; movementId: string }
  | { status: "pending"; pendingId: string }
  | { status: "duplicate"; existingMovementId: string }

/**
 * Mapea orderMode del SaaS a CashChannel del POS.
 *
 * Regla: 'dine-in' y 'business' son presenciales → 'counter'.
 *        'takeaway' y 'delivery' son externos → 'takeasygo'.
 */
function mapOrderModeToChannel(orderMode: string): CashChannel {
  switch (orderMode) {
    case "dine-in":
    case "business":
      return "counter"
    case "takeaway":
    case "delivery":
      return "takeasygo"
    default:
      return "takeasygo"
  }
}

/**
 * Procesa una venta de TakeasyGO y la registra en la caja activa.
 *
 * Idempotencia (Consenso §2.1): busca relatedOrderId + type en todas las
 * cajas abiertas antes de insertar. Si existe, retorna 'duplicate'.
 *
 * Routing multi-caja (Consenso §2.3): busca caja por defaultForChannel.
 * Si no hay caja abierta, guarda en pendingMovements.
 *
 * @param payload - Datos de la venta del Sync Layer
 * @returns Resultado del procesamiento
 *
 * @example
 * ```ts
 * const result = await handleTakeasyGOSale({
 *   orderId: "ord_123",
 *   tenantId: "tenant_abc",
 *   amount: 4500,
 *   paymentMethod: "mercadopago",
 *   orderMode: "delivery",
 * })
 * // result.status === "registered"
 * ```
 */
export async function handleTakeasyGOSale(
  payload: TakeasyGOSalePayload
): Promise<TakeasyGOSaleResult> {
  const { orderId, tenantId, amount, paymentMethod, orderMode } = payload

  const channel = mapOrderModeToChannel(orderMode)

  // ── 1. Idempotencia — buscar si ya existe ────────────────────────
  const allRegisters = await db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .toArray()

  for (const reg of allRegisters) {
    const existing = reg.movements.find(
      (m) => m.relatedOrderId === orderId && m.type === "sale"
    )
    if (existing) {
      return { status: "duplicate", existingMovementId: existing.id }
    }
  }

  // ── 2. Buscar caja target ────────────────────────────────────────
  const targetRegister = await getRegisterForChannel(tenantId, channel)

  // ── 3. Si no hay caja abierta, guardar como pending ──────────────
  if (!targetRegister) {
    const pendingId = crypto.randomUUID()
    await db.pendingMovements.add({
      id: pendingId,
      tenantId,
      type: "sale" as CashMovementType,
      amount,
      reason: `Venta TakeasyGO #${orderId}`,
      userId: "system",
      timestamp: new Date(),
      relatedOrderId: orderId,
      channel,
      paymentMethod,
      source: "takeasygo_sync",
      createdAt: new Date(),
    })
    return { status: "pending", pendingId }
  }

  // ── 4. Registrar movimiento en la caja target ────────────────────
  const { movement } = await addMovement(
    tenantId,
    targetRegister.id,
    "sale",
    amount,
    `Venta TakeasyGO #${orderId}`,
    "system",
    channel,
    paymentMethod,
    orderId
  )

  return { status: "registered", movementId: movement.id }
}
