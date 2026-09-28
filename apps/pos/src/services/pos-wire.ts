import type {
  CashMovement,
  CashRegister,
  Order,
  ZReport,
} from "@takeasygo/types"

// ============================================================================
// pos-wire — rehidratación del JSON del server → objetos Date del POS
// ============================================================================
// Deuda D10: JSON serializa los Date como strings ISO. El POS declara
// `openedAt: Date`, `closedAt?: Date`, `timestamp: Date`… y los consume con
// `.toISOString()`, comparaciones de rango y `timeAgo()`. Guardar el JSON tal
// cual en Dexie produciría `undefined is not a function` al imprimir el Z o al
// filtrar historial por fecha.
//
// Toda respuesta de /api/[tenant]/pos/* que lleve fechas pasa por acá ANTES
// de tocar Dexie. Leer no: Dexie solo contiene lo que ya rehidratamos.
// ============================================================================

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function requireDate(value: Date | string | null | undefined): Date {
  return toDate(value) ?? new Date(0)
}

export function rehydrateMovement(movement: CashMovement): CashMovement {
  return { ...movement, timestamp: requireDate(movement.timestamp) }
}

function rehydrateZReport(zReport: ZReport): ZReport {
  return {
    ...zReport,
    closedAt: requireDate(zReport.closedAt),
    generatedAt: requireDate(zReport.generatedAt),
  }
}

export function rehydrateRegister(register: CashRegister): CashRegister {
  const rehydrated: CashRegister = {
    ...register,
    openedAt: requireDate(register.openedAt),
    movements: (register.movements ?? []).map(rehydrateMovement),
  }

  const closedAt = toDate(register.closedAt)
  if (closedAt) rehydrated.closedAt = closedAt

  if (register.zReport) {
    rehydrated.zReport = rehydrateZReport(register.zReport)
  }

  return rehydrated
}

export function rehydrateRegisters(registers: CashRegister[]): CashRegister[] {
  return registers.map(rehydrateRegister)
}

export function rehydrateOrder(order: Order): Order {
  const rehydrated: Order = {
    ...order,
    createdAt: requireDate(order.createdAt),
    updatedAt: requireDate(order.updatedAt),
  }

  for (const field of ["syncedAt", "integratedAt"] as const) {
    const value = toDate(order[field])
    if (value) rehydrated[field] = value
  }

  return rehydrated
}

export function rehydrateOrders(orders: Order[]): Order[] {
  return orders.map(rehydrateOrder)
}
