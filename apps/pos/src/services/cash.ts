import type {
  CashRegister,
  CashMovement,
  CashMovementType,
  CashChannel,
  PaymentMethod,
} from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi } from "./pos-api"
import { runMutation, syncRegisters } from "./polling"
import {
  rehydrateMovement,
  rehydrateRegister,
} from "./pos-wire"

// ============================================================================
// Server-first (V1 POS Online) — caja
// ============================================================================
// Apertura, cierre, movimientos y asignación de pendientes van contra
// /api/[tenant]/pos/cash/registers*. El server es la única fuente de verdad:
//   §1    el arqueo (cashExpectedDelta) se aplica con `$inc` en Mongo y se
//         RECALCULA desde los movimientos reales al cerrar.
//   §2.1  (registerId, relatedOrderId, type) es índice único: el reintento
//         devuelve el existente, jamás duplica.
//   §2    una caja abierta por sede (índice parcial único + 409 legible).
//   §3    el ZReport y el shareToken los genera el server al cerrar.
// Dexie se escribe recién con la respuesta, y con las fechas rehidratadas
// (D10). El outbox ya no participa: el hecho quedó persistido en el server.
// `runMutation` marca cada ciclo para que el polling (M6) no escriba por
// encima con una respuesta anterior.
// ============================================================================

type WireResponse = { serverTime?: string }

async function postRegister(
  tenantId: string,
  path: string,
  body: Record<string, unknown>
): Promise<WireResponse & { register: CashRegister }> {
  return posApi(tenantId, path, { method: "POST", body })
}

// ============================================================================
// Mutaciones
// ============================================================================

/**
 * Abre una nueva caja.
 *
 * @param initialAmount - Monto inicial en efectivo (centavos enteros)
 * @param openedBy - Nombre/ID de quien abre la caja
 * @param defaultForChannel - Canal default para routing multi-caja (null = acepta todos)
 *
 * Decisión: Consenso v1 §2.3 — defaultForChannel controla a qué canal
 * se asignan los pedidos de TakeasyGO cuando hay múltiples cajas abiertas.
 *
 * La regla "una caja abierta por sede" la decide el server (409); no se
 * consulta Dexie antes porque puede estar desactualizada respecto de otra
 * terminal.
 */
export async function openRegister(
  tenantId: string,
  initialAmount: number,
  openedBy: string,
  defaultForChannel: CashChannel | null = null
): Promise<CashRegister> {
  return runMutation(async () => {
    const { register } = await postRegister(
      tenantId,
      "/cash/registers",
      {
        id: crypto.randomUUID(),
        initialAmount,
        openedBy,
        defaultForChannel,
      }
    )

    const rehydrated = rehydrateRegister(register)
    await db.cashRegister.put(rehydrated)
    return rehydrated
  })
}

/**
 * Cierra la caja y genera el ZReport inmutable.
 *
 * Decisión: Consenso v1 §3 — El ZReport se genera UNA VEZ al cerrar y se
 * persiste en CashRegister.zReport. Nunca se recalcula después.
 *
 * El server recalcula el arqueo esperado desde los movimientos reales,
 * genera el Z y el shareToken, y responde con la caja ya cerrada.
 */
export async function closeRegister(
  tenantId: string,
  registerId: string,
  finalAmount: number,
  closedBy: string
): Promise<CashRegister> {
  return runMutation(async () => {
    const { register } = await postRegister(
      tenantId,
      `/cash/registers/${encodeURIComponent(registerId)}/close`,
      { finalAmount, closedBy }
    )

    const rehydrated = rehydrateRegister(register)
    await db.cashRegister.put(rehydrated)
    return rehydrated
  })
}

/**
 * Registra un movimiento en la caja.
 *
 * @param amount - Monto en centavos, siempre positivo
 * @param relatedOrderId - ID de la orden relacionada (idempotencia §2.1)
 *
 * El server valida monto/enum, aplica el delta de arqueo solo para efectivo
 * (§1) y devuelve el movimiento + la caja refrescada.
 */
export async function addMovement(
  tenantId: string,
  registerId: string,
  type: CashMovementType,
  amount: number,
  reason: string,
  userId: string,
  channel: CashChannel,
  paymentMethod: PaymentMethod,
  relatedOrderId?: string
): Promise<{ movement: CashMovement; register: CashRegister }> {
  // Validación de argumentos puros (no depende de estado): evita un round trip
  // cuando el caller se equivoca de frente. El server repite la misma regla.
  if (amount <= 0) throw new Error("[cash] El monto debe ser positivo")

  return runMutation(async () => {
    const { movement, register } = await posApi<{
      movement: CashMovement
      register: CashRegister
    }>(tenantId, `/cash/registers/${encodeURIComponent(registerId)}/movements`, {
      method: "POST",
      body: {
        id: crypto.randomUUID(),
        type,
        amount,
        reason,
        channel,
        paymentMethod,
        userId,
        ...(relatedOrderId ? { relatedOrderId } : {}),
      },
    })

    const rehydrated = rehydrateRegister(register)
    await db.cashRegister.put(rehydrated)

    return { movement: rehydrateMovement(movement), register: rehydrated }
  })
}

// ============================================================================
// Lecturas — siguen locales: Dexie es el read model y `services/polling.ts`
// lo refresca contra GET /pos/cash/registers sin borrar nada.
// ============================================================================

export async function getActiveRegister(tenantId: string): Promise<CashRegister | undefined> {
  return db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .and((r) => r.status === "open")
    .first()
}

/**
 * Busca caja abierta para un canal específico.
 * Decisión: Consenso v1 §2.3 — Routing multi-caja.
 *
 * Prioridad:
 * 1. Caja con defaultForChannel === canal solicitado
 * 2. Caja con defaultForChannel !== null (fallback)
 * 3. Primera caja abierta (último fallback)
 */
export async function getRegisterForChannel(
  tenantId: string,
  channel: CashChannel
): Promise<CashRegister | undefined> {
  const openRegisters = await db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .and((r) => r.status === "open")
    .toArray()

  if (openRegisters.length === 0) return undefined

  // Prioridad: defaultForChannel exacto
  const exact = openRegisters.find((r) => r.defaultForChannel === channel)
  if (exact) return exact

  // Fallback: cualquier caja con default definido
  const withDefault = openRegisters.find((r) => r.defaultForChannel !== null)
  if (withDefault) return withDefault

  // Último fallback: primera caja abierta
  return openRegisters[0]
}

/**
 * Reasigna movimientos pendientes a una caja abierta.
 * Decisión: Consenso v1 §2.2 — Tabla pendingMovements.
 *
 * Se llama al abrir una caja, o manualmente por el manager.
 * Cada pendiente se sube como movimiento normal: si el server ya lo tiene
 * (mismo relatedOrderId + type) lo devuelve sin duplicar y igualmente lo
 * descartamos de la cola. Si el server rechaza, el pendiente queda en la
 * cola para el próximo intento.
 */
export async function assignPendingMovements(
  tenantId: string,
  registerId: string
): Promise<{ assigned: number; register: CashRegister }> {
  // Reentrante: adentro llama `addMovement`, que también se marca.
  return runMutation(async () => {
    const pending = await db.pendingMovements
      .where("tenantId")
      .equals(tenantId)
      .toArray()

    // La caja que decide el routing sale del server: Dexie puede no tenerla
    // todavía (se abrió en otra terminal) y además así queda refrescada.
    const { register } = await posApi<{ register: CashRegister }>(
      tenantId,
      `/cash/registers/${encodeURIComponent(registerId)}`
    )

    let assigned = 0
    let current = rehydrateRegister(register)
    await db.cashRegister.put(current)

    for (const p of pending) {
      // Solo la caja default para el canal (o la que acepta todos) se queda el
      // movimiento; si no, esperamos a que se abra esa otra caja.
      const shouldAssign =
        current.defaultForChannel === null ||
        current.defaultForChannel === p.channel

      if (!shouldAssign) continue

      // Ya está en esta caja según Dexie (dato confirmado por el server):
      // no reenviamos, solo descartamos de la cola.
      const exists = current.movements.some(
        (m) => m.relatedOrderId === p.relatedOrderId && m.type === p.type
      )
      if (exists) {
        await db.pendingMovements.delete(p.id)
        assigned++
        continue
      }

      // Propaga el error del server: la cola queda intacta para reintentar.
      const result = await addMovement(
        tenantId,
        registerId,
        p.type,
        p.amount,
        p.reason,
        p.userId,
        p.channel,
        p.paymentMethod,
        p.relatedOrderId
      )

      await db.pendingMovements.delete(p.id)
      current = result.register
      assigned++
    }

    return { assigned, register: current }
  })
}

export async function getRegisterHistory(
  tenantId: string,
  limit = 20
): Promise<CashRegister[]> {
  return db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .and((r) => r.status === "closed")
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * Obtiene historial de cajas cerradas filtrado por rango de fechas.
 * Usado en la escena "historial" del CashDashboard.
 */
export async function getRegisterHistoryByDate(
  tenantId: string,
  fromDate: Date,
  toDate: Date
): Promise<CashRegister[]> {
  return db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .and(
      (r) =>
        r.status === "closed" &&
        r.closedAt !== undefined &&
        r.closedAt >= fromDate &&
        r.closedAt <= toDate
    )
    .sortBy("closedAt")
    .then((list) => list.reverse())
}

/**
 * Obtiene los movimientos pendientes de un tenant.
 */
export async function getPendingMovements(
  tenantId: string
) {
  return db.pendingMovements
    .where("tenantId")
    .equals(tenantId)
    .toArray()
}

/**
 * Descarga las cajas de la sede desde el server y las deja en Dexie.
 *
 * Delega en el mismo diff-then-put que usa el polling (M6): solo escribe lo
 * que cambió, así que un refresco manual tampoco re-renderiza la pantalla
 * entera. El polling ya lo hace solo cada 7 s; esto queda para cuando el
 * caller quiera una actualización puntual inmediata.
 */
export async function refreshRegisters(tenantId: string): Promise<CashRegister[]> {
  await syncRegisters(tenantId)
  return db.cashRegister.where("tenantId").equals(tenantId).toArray()
}

/**
 * Genera la URL compartible para un Z Report.
 * Decisión: Consenso v1 §4 — Token de alta entropía, expira en 30 días.
 *
 * @param register - Caja cerrada con shareToken
 * @returns URL completa o undefined si no tiene token
 */
export function getShareUrl(register: CashRegister): string | undefined {
  if (!register.shareToken) return undefined
  const syncUrl = import.meta.env.VITE_SYNC_URL ?? ""
  return `${syncUrl}/api/v1/z-report/${register.shareToken}`
}
