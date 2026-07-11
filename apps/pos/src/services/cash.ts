import type { CashRegister, CashMovement, CashMovementType } from "@takeasygo/types"
import { db } from "../db/dexie"
import { enqueue } from "./event-queue"

export async function openRegister(
  tenantId: string,
  initialAmount: number,
  openedBy: string
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
  }

  await db.cashRegister.add(register)

  await enqueue(tenantId, "cash_register.opened", {
    registerId: register.id,
    initialAmount,
    openedBy,
    timestamp: register.openedAt.toISOString(),
  })

  return register
}

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

  await db.cashRegister.put(updated)

  await enqueue(tenantId, "cash_register.closed", {
    registerId: register.id,
    finalAmount,
    expectedAmount,
    difference,
    closedBy,
    timestamp: updated.closedAt!.toISOString(),
  })

  return updated
}

export async function addMovement(
  tenantId: string,
  registerId: string,
  type: CashMovementType,
  amount: number,
  reason: string,
  userId: string,
  relatedOrderId?: string
): Promise<{ movement: CashMovement; register: CashRegister }> {
  if (amount <= 0) throw new Error("[cash] El monto debe ser positivo")

  const register = await db.cashRegister.get(registerId)
  if (!register) throw new Error("[cash] Caja no encontrada")
  if (register.tenantId !== tenantId) throw new Error("[cash] Tenant mismatch")
  if (register.status !== "open") throw new Error("[cash] La caja está cerrada")

  const movement: CashMovement = {
    id: crypto.randomUUID(),
    type,
    amount,
    reason,
    userId,
    timestamp: new Date(),
    relatedOrderId,
  }

  const adjustedAmount =
    type === "income" || type === "deposit" || type === "sale"
      ? amount
      : -amount

  const updated: CashRegister = {
    ...register,
    movements: [...register.movements, movement],
    expectedAmount: (register.expectedAmount ?? register.initialAmount) + adjustedAmount,
  }

  await db.cashRegister.put(updated)

  await enqueue(tenantId, "cash_register.movement", {
    registerId: register.id,
    movementId: movement.id,
    type,
    amount,
    reason,
    userId,
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
