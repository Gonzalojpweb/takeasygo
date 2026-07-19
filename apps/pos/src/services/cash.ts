import type {
  CashRegister,
  CashMovement,
  CashMovementType,
  CashChannel,
  PaymentMethod,
} from "@takeasygo/types"
import { db } from "../db/dexie"
import { enqueue } from "./event-queue"
import { generateZReport } from "./z-report"

/**
 * Abre una nueva caja.
 *
 * @param tenantId - ID del tenant
 * @param initialAmount - Monto inicial en efectivo
 * @param openedBy - Nombre/ID de quien abre la caja
 * @param defaultForChannel - Canal default para routing multi-caja (null = acepta todos)
 *
 * Decisión: Consenso v1 §2.3 — defaultForChannel controla a qué canal
 * se asignan los pedidos de TakeasyGO cuando hay múltiples cajas abiertas.
 */
export async function openRegister(
  tenantId: string,
  initialAmount: number,
  openedBy: string,
  defaultForChannel: CashChannel | null = null
): Promise<CashRegister> {
  const existing = await db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .and((r) => r.status === "open")
    .first()

  if (existing) {
    throw new Error("[cash] Ya hay una caja abierta")
  }

  const register: CashRegister = {
    id: crypto.randomUUID(),
    tenantId,
    openedBy,
    openedAt: new Date(),
    initialAmount,
    expectedAmount: initialAmount,
    difference: 0,
    movements: [],
    status: "open",
    defaultForChannel,
  }

  await db.cashRegister.add(register)

  await enqueue(tenantId, "cash_register.opened", {
    registerId: register.id,
    initialAmount,
    openedBy,
    defaultForChannel,
    timestamp: register.openedAt.toISOString(),
  })

  return register
}

/**
 * Cierra la caja y genera el ZReport inmutable.
 *
 * Decisión: Consenso v1 §3 — El ZReport se genera UNA VEZ al cerrar y
 * se persiste en CashRegister.zReport. Nunca se recalcula después.
 *
 * @param tenantId - ID del tenant
 * @param registerId - ID de la caja a cerrar
 * @param finalAmount - Conteo físico de efectivo
 * @param closedBy - Nombre/ID de quien cierra la caja
 */
export async function closeRegister(
  tenantId: string,
  registerId: string,
  finalAmount: number,
  closedBy: string
): Promise<CashRegister> {
  const register = await db.cashRegister.get(registerId)
  if (!register) throw new Error("[cash] Caja no encontrada")
  if (register.tenantId !== tenantId) throw new Error("[cash] Tenant mismatch")
  if (register.status !== "open") throw new Error("[cash] La caja ya está cerrada")

  const expectedAmount = register.expectedAmount ?? register.initialAmount
  const difference = finalAmount - expectedAmount

  const updated: CashRegister = {
    ...register,
    closedBy,
    closedAt: new Date(),
    finalAmount,
    expectedAmount,
    difference,
    status: "closed",
  }

  // ── Generar ZReport inmutable (Consenso §3) ──────────────────────
  const zReport = generateZReport({
    register: updated,
    movements: updated.movements,
    closedBy,
  })

  // ── Share token para vista web compartible (Consenso §4) ───────────
  const shareToken = crypto.randomUUID()

  const closedRegister: CashRegister = {
    ...updated,
    zReport,
    shareToken,
  }

  await db.cashRegister.put(closedRegister)

  await enqueue(tenantId, "cash_register.closed", {
    registerId: register.id,
    finalAmount,
    expectedAmount,
    difference,
    closedBy,
    shareToken,
    zReport,
    timestamp: closedRegister.closedAt!.toISOString(),
  })

  return closedRegister
}

/**
 * Registra un movimiento en la caja.
 *
 * @param tenantId - ID del tenant
 * @param registerId - ID de la caja abierta
 * @param type - Tipo de movimiento (income, expense, withdrawal, deposit, sale, refund)
 * @param amount - Monto (siempre positivo)
 * @param reason - Descripción del movimiento
 * @param userId - ID del usuario que registra
 * @param channel - Canal de la venta (counter | takeasygo)
 * @param paymentMethod - Método de pago utilizado
 * @param relatedOrderId - ID de la orden relacionada (para idempotencia)
 *
 * Idempotencia (Consenso §2.1): si relatedOrderId + type ya existe en la caja,
 * retorna el movimiento existente sin duplicar.
 *
 * Regla de negocio (Consenso §1): expectedAmount suma SOLO efectivo.
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
  if (amount <= 0) throw new Error("[cash] El monto debe ser positivo")

  const register = await db.cashRegister.get(registerId)
  if (!register) throw new Error("[cash] Caja no encontrada")
  if (register.tenantId !== tenantId) throw new Error("[cash] Tenant mismatch")
  if (register.status !== "open") throw new Error("[cash] La caja está cerrada")

  // ── Idempotencia (Consenso §2.1) ─────────────────────────────────
  // Si ya existe un movimiento con el mismo relatedOrderId + tipo,
  // retornar el existente sin duplicar.
  if (relatedOrderId) {
    const existing = register.movements.find(
      (m) => m.relatedOrderId === relatedOrderId && m.type === type
    )
    if (existing) {
      return { movement: existing, register }
    }
  }

  const movement: CashMovement = {
    id: crypto.randomUUID(),
    type,
    amount,
    reason,
    userId,
    timestamp: new Date(),
    relatedOrderId,
    channel,
    paymentMethod,
  }

  // ── Cálculo de expectedAmount ─────────────────────────────────────
  // Regla de negocio (Consenso §1): SOLO el efectivo afecta el arqueo.
  // Si el restaurante cobra un TakeasyGO delivery en efectivo contra entrega,
  // ese efectivo SÍ suma al arqueo. Si pagan con MP o POSNET, no suma.
  const isCash = paymentMethod === "cash"
  const isPositive =
    type === "income" || type === "deposit" || type === "sale"
  const adjustedAmount = isCash ? (isPositive ? amount : -amount) : 0

  const updated: CashRegister = {
    ...register,
    movements: [...register.movements, movement],
    expectedAmount:
      (register.expectedAmount ?? register.initialAmount) + adjustedAmount,
  }

  await db.cashRegister.put(updated)

  await enqueue(tenantId, "cash_register.movement", {
    registerId: register.id,
    movementId: movement.id,
    type,
    amount,
    reason,
    userId,
    channel,
    paymentMethod,
    relatedOrderId,
    timestamp: movement.timestamp.toISOString(),
  })

  return { movement, register: updated }
}

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
 * Los movimientos se asignan si la caja target coincide con su canal.
 */
export async function assignPendingMovements(
  tenantId: string,
  registerId: string
): Promise<{ assigned: number; register: CashRegister }> {
  const register = await db.cashRegister.get(registerId)
  if (!register) throw new Error("[cash] Caja no encontrada")
  if (register.tenantId !== tenantId) throw new Error("[cash] Tenant mismatch")
  if (register.status !== "open") throw new Error("[cash] La caja está cerrada")

  const pending = await db.pendingMovements
    .where("tenantId")
    .equals(tenantId)
    .toArray()

  let assigned = 0
  const updatedMovements = [...register.movements]
  let updatedExpectedAmount = register.expectedAmount ?? register.initialAmount

  for (const p of pending) {
    // Asignar si:
    // - La caja es default para el canal del movimiento, O
    // - La caja es default para todos (null), O
    // - No hay otra caja que sea default para ese canal
    const shouldAssign =
      register.defaultForChannel === null ||
      register.defaultForChannel === p.channel

    if (!shouldAssign) continue

    // Idempotencia: no duplicar si ya existe
    const exists = updatedMovements.some(
      (m) => m.relatedOrderId === p.relatedOrderId && m.type === p.type
    )
    if (exists) {
      await db.pendingMovements.delete(p.id)
      assigned++
      continue
    }

    const movement: CashMovement = {
      id: crypto.randomUUID(),
      type: p.type,
      amount: p.amount,
      reason: p.reason,
      userId: p.userId,
      timestamp: p.timestamp,
      relatedOrderId: p.relatedOrderId,
      channel: p.channel,
      paymentMethod: p.paymentMethod,
    }

    updatedMovements.push(movement)

    // Solo efectivo afecta expectedAmount
    const isCash = p.paymentMethod === "cash"
    const isPositive = p.type === "income" || p.type === "deposit" || p.type === "sale"
    if (isCash) {
      updatedExpectedAmount += isPositive ? p.amount : -p.amount
    }

    await db.pendingMovements.delete(p.id)
    assigned++
  }

  if (assigned > 0) {
    const updated: CashRegister = {
      ...register,
      movements: updatedMovements,
      expectedAmount: updatedExpectedAmount,
    }
    await db.cashRegister.put(updated)
    return { assigned, register: updated }
  }

  return { assigned: 0, register }
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
    .reverse()
    .sortBy("closedAt")
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
