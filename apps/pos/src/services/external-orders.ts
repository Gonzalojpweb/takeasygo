import type { Order, PaymentMethod } from "@takeasygo/types"
import { db } from "../db/dexie"

// ============================================================================
// External Orders — Persistencia de pedidos TakeasyGO en Dexie
// ============================================================================
// Regla de negocio (Cristóbal): UN pedido = UN registro, desde que llega
// hasta que se cierra. La transformación es un UPDATE IN-PLACE, nunca
// un createOrder() que genere una fila nueva.
//
// Flujo:
//   1. Pedido llega via socket o fetchPendingOrders → persistExternalOrder()
//   2. Cashier valida → se queda como está (source: 'external')
//   3. Cashier transforma → transformExternalOrder() → update in-place
//   4. La Order aparece en Ventas con source: 'external'
//
// Idempotencia: el `id` de Dexie ES el `orderId` del SyncLayer (primary key
// único). persistExternalOrder() hace get antes de add — si el registro ya
// existe, actualiza en lugar de duplicar. Seguro contra reconexiones y
// reprocesos del SyncLayer.
//
// Out-of-order (Decisión Cristóbal, 21 jul 2026):
//   Si un evento (confirmed, cancelled, etc.) llega ANTES que order:created,
//   se guarda en pendingStatusUpdates (PK=orderId, upsert). Cuando
//   persistExternalOrder() crea el registro, lo aplica y borra en una
//   transacción atómica. Last-write-wins: si llegan 2 eventos antes de
//   order:created, se queda con el más reciente.
//
// Cancelación: cancelExternalOrder() actualiza status a 'cancelled' IN-PLACE.
// El registro NO se borra — queda en el historial para trazabilidad.
// ============================================================================

const PENDING_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas

// Monotonía: orden de estados para prevenir stale events.
// Si el nuevo estado es anterior al actual, se descarta.
const STATUS_ORDER: Record<string, number> = {
  awaiting_payment: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: 5,
}

function isForwardStatus(current: string | undefined, next: string): boolean {
  return (STATUS_ORDER[next] ?? 0) >= (STATUS_ORDER[current ?? "awaiting_payment"] ?? 0)
}

interface PersistExternalOrderParams {
  /** ID del pedido en el SyncLayer/SaaS — usa como Dexie id */
  orderId: string
  tenantId: string
  source?: Order["source"]
  status?: Order["status"]
  externalStatus?: Order["externalStatus"]
  paymentMethod?: PaymentMethod
  items: Order["items"]
  total: number
  notes?: string
}

/**
 * Persiste un pedido externo en Dexie.
 *
 * IDEMPOTENCIA (blindada en 2 capas):
 *   1. Dexie: el `id` del registro ES el `orderId` del SyncLayer (primary key único).
 *      Si ya existe, `db.orders.add()` lanza ConstraintError.
 *   2. Código: `db.orders.get(orderId)` antes de insertar — si existe, actualiza
 *      en lugar de insertar. Esto previene el ConstraintError y permite merge
 *      de campos que cambiaron entre la primera y segunda llamada.
 *
 * OUT-OF-ORDER:
 *   Si hay eventos pendientes en pendingStatusUpdates (llegaron antes que
 *   order:created), se aplican DENTRO de la transacción de creación y se
 *   borran. Esto garantiza que un order:status_updated(confirmed) que llegó
 *   primero no se pierda cuando order:created crea el registro.
 *
 * atomicidad: El ciclo "leer pendientes → crear registro → borrar pendientes"
 * corre dentro de db.transaction() para evitar carreras entre dos llamadas
 * simultáneas al mismo orderId.
 *
 * Se llama desde:
 *   - IncomingOrdersDashboard: al recibir order:created por socket
 *   - IncomingOrdersDashboard: al hacer fetchPendingOrders (reconnect)
 */
export async function persistExternalOrder(
  params: PersistExternalOrderParams
): Promise<string> {
  const {
    orderId,
    tenantId,
    source = "external",
    status = "pending",
    externalStatus,
    paymentMethod,
    items,
    total,
    notes,
  } = params

  const existing = await db.orders.get(orderId)

  if (existing) {
    // Idempotencia: actualizar solo campos que cambiaron
    // Monotonía: externalStatus no retrocede (previene stale events de reconexión)
    const safeExternalStatus = (externalStatus !== undefined && isForwardStatus(existing.externalStatus, externalStatus))
      ? externalStatus
      : existing.externalStatus

    await db.orders.update(orderId, {
      externalStatus: safeExternalStatus,
      status: existing.status === "pending" && status !== "pending" ? status : existing.status,
      paymentMethod: paymentMethod ?? existing.paymentMethod,
      updatedAt: new Date(),
    })
    return orderId
  }

  // ── Out-of-order: aplicar pendingStatusUpdates dentro de transacción ──
  const now = new Date()

  let appliedExternalStatus = externalStatus ?? "awaiting_payment"
  let appliedCancelReason: string | undefined

  await db.transaction("rw", [db.orders, db.pendingStatusUpdates], async () => {
    // 1. Leer y borrar pendientes (si existen)
    const pending = await db.pendingStatusUpdates.get(orderId)
    if (pending) {
      if (pending.type === "status_update" && pending.externalStatus) {
        appliedExternalStatus = pending.externalStatus
      } else if (pending.type === "cancel") {
        // Cancelación antes de creación — creamos el registro ya cancelado
        appliedCancelReason = pending.cancelReason
      }
      await db.pendingStatusUpdates.delete(orderId)
    }

    // 2. Crear el registro con el status correcto
    const order: Order = {
      id: orderId,
      tenantId,
      source,
      status: appliedCancelReason ? "cancelled" : status,
      items,
      total,
      menuVersion: 1,
      notes: appliedCancelReason
        ? `${notes ?? ""} [Cancelado: ${appliedCancelReason}]`.trim()
        : notes,
      externalOrderId: orderId,
      externalStatus: appliedCancelReason ? "cancelled" : appliedExternalStatus,
      paymentMethod,
      paymentSource: "external_prepaid",
      createdAt: now,
      updatedAt: now,
    }

    await db.orders.add(order)
  })

  return orderId
}

interface TransformExternalOrderParams {
  /** ID del pedido en Dexie (== externalOrderId) */
  orderId: string
  tenantId: string
  /** Nuevos items confirmados por el cashier (reemplazan los originales) */
  items: Order["items"]
  total: number
  notes?: string
  serverId?: string
}

/**
 * Transforma un pedido externo en orden local — UPDATE IN-PLACE.
 *
 * NO crea un registro nuevo. Actualiza el mismo registro que se persistió
 * cuando llegó el pedido, agregando:
 *   - source: 'external' (ya estaba)
 *   - integratedAt: timestamp de transformación
 *   - integratedBy: quién transformó (por ahora userId o 'cashier')
 *   - items: items confirmados por el cashier
 *   - total recalculado
 *   - status: 'pending' (listo para cocina)
 *
 * El order.id de Dexie se mantiene como el externalOrderId original.
 * Para la cocina, se usa el campo tableId como referencia: `IN-XXXXXXXX`.
 */
export async function transformExternalOrder(
  params: TransformExternalOrderParams
): Promise<Order> {
  const { orderId, tenantId, items, total, notes } = params

  const existing = await db.orders.get(orderId)
  if (!existing) {
    throw new Error(`[external-orders] Order ${orderId} not found`)
  }
  if (existing.tenantId !== tenantId) {
    throw new Error("[external-orders] Tenant mismatch")
  }

  const now = new Date()
  await db.orders.update(orderId, {
    items,
    total,
    notes: notes ?? existing.notes,
    status: "pending",
    integratedAt: now,
    integratedBy: params.serverId ?? "cashier",
    updatedAt: now,
  })

  const updated = await db.orders.get(orderId)
  if (!updated) {
    throw new Error(`[external-orders] Order ${orderId} disappeared after update`)
  }

  return updated
}

/**
 * Actualiza el externalStatus de un pedido externo.
 *
 * Si el registro ya existe en Dexie, lo actualiza IN-PLACE.
 * Si NO existe (evento llegó antes que order:created), guarda en
 * pendingStatusUpdates para que persistExternalOrder() lo aplique al crear.
 *
 * Last-write-wins: PK = orderId en pendingStatusUpdates, así un segundo
 * evento sobreescribe al primero (no acumula filas).
 */
export async function updateExternalOrderStatus(
  orderId: string,
  tenantId: string,
  externalStatus: Order["externalStatus"]
): Promise<void> {
  const existing = await db.orders.get(orderId)

  if (existing) {
    // Monotonía: no sobrescribir externalStatus con un estado más viejo
    if (!isForwardStatus(existing.externalStatus, externalStatus)) {
      return
    }

    const changes: { externalStatus: Order["externalStatus"]; updatedAt: Date; status?: Order["status"] } = {
      externalStatus,
      updatedAt: new Date(),
    }

    // Mirror terminal SaaS statuses to local POS status
    // Siempre se aplica (sin guard de monotonía) porque son estados terminales
    // que el SaaS puede forzar desde cualquier punto del ciclo.
    if (externalStatus === "delivered") {
      changes.status = "delivered"
    } else if (externalStatus === "cancelled") {
      changes.status = "cancelled"
    }

    await db.orders.update(orderId, changes)
    return
  }

  // Out-of-order: guardar para aplicar cuando persistExternalOrder() cree el registro
  await db.pendingStatusUpdates.put({
    orderId,
    tenantId,
    type: "status_update",
    externalStatus,
    createdAt: new Date(),
  })
}

/**
 * Marca un pedido externo como cancelado.
 *
 * Si el registro ya existe en Dexie, lo actualiza IN-PLACE (status: 'cancelled').
 * Si NO existe (evento llegó antes que order:created), guarda en
 * pendingStatusUpdates para que persistExternalOrder() lo aplique al crear.
 *
 * El registro NO se borra — queda en el historial para trazabilidad.
 */
export async function cancelExternalOrder(
  orderId: string,
  tenantId: string,
  reason?: string
): Promise<void> {
  const existing = await db.orders.get(orderId)

  if (existing) {
    if (existing.tenantId !== tenantId) return
    await db.orders.update(orderId, {
      status: "cancelled",
      notes: reason ? `${existing.notes ?? ""} [Cancelado: ${reason}]` : existing.notes,
      updatedAt: new Date(),
    })
    return
  }

  // Out-of-order: guardar para aplicar cuando persistExternalOrder() cree el registro
  await db.pendingStatusUpdates.put({
    orderId,
    tenantId,
    type: "cancel",
    cancelReason: reason,
    createdAt: new Date(),
  })
}

// ============================================================================
// Limpieza de pendingStatusUpdates huérfanos
// ============================================================================
// Si order:created nunca llega (pedido cancelado en SaaS antes de propagarse,
// bug en SyncLayer), la fila en pendingStatusUpdates queda para siempre.
// Esta función borra pendientes con más de 24h. Se llama al importar el módulo.
// ============================================================================

export async function cleanupPendingStatusUpdates(): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS)
  const stale = await db.pendingStatusUpdates
    .where("createdAt")
    .below(cutoff)
    .toArray()

  if (stale.length === 0) return 0

  const ids = stale.map((r) => r.orderId)
  await db.pendingStatusUpdates.bulkDelete(ids)
  return ids.length
}

// Ejecutar limpieza al importar (fire-and-forget, no bloquea)
cleanupPendingStatusUpdates().catch(() => {})
