import type {
  CashDenominationCount,
  CashExpenseCategory,
  CashMovementType,
} from "@takeasygo/types"

// ============================================================================
// Control de caja — reglas puras compartidas POS ⇄ SaaS (Fase 1, 2026-10)
// ============================================================================
// Documentación de negocio: ADMIN/VALIDACION_CAJA_IVA_ARCA_2026-10-23.md §3.
//
//   · Categorías de egreso: todo gasto o retiro lleva una categoría, así el
//     dueño ve en qué se fue la plata (flujo de fondos) y no un texto libre.
//   · Retiros: requieren la aprobación de un encargado (PIN) cuando los hace
//     un cajero. Los gastos no (pagar al proveedor es operación diaria).
//   · Conteo por denominación: el cierre ciego se declara billete por
//     billete; el total lo calcula el sistema, nunca se tipea dos veces.
//   · Rol con acceso al saldo esperado: solo encargado/admin. El cajero
//     cuenta sin conocerlo (cierre ciego).
// ============================================================================

export const CASH_EXPENSE_CATEGORIES: readonly CashExpenseCategory[] = [
  "suppliers",
  "supplies",
  "services",
  "salaries",
  "owner_withdrawal",
  "other",
]

export const CASH_EXPENSE_CATEGORY_LABELS: Readonly<Record<CashExpenseCategory, string>> = {
  suppliers: "Proveedores",
  supplies: "Compras menores",
  services: "Servicios",
  salaries: "Sueldos y adelantos",
  owner_withdrawal: "Retiro del dueño",
  other: "Otros",
}

export function isCashExpenseCategory(value: unknown): value is CashExpenseCategory {
  return typeof value === "string" && (CASH_EXPENSE_CATEGORIES as readonly string[]).includes(value)
}

/** Egresos que exigen categoría. */
export function movementRequiresCategory(type: CashMovementType): boolean {
  return type === "expense" || type === "withdrawal"
}

/** Movimientos que un cajero no puede hacer sin el PIN de un encargado. */
export function movementRequiresApproval(type: CashMovementType): boolean {
  return type === "withdrawal"
}

/**
 * Denominaciones en circulación (ARS), en centavos, de mayor a menor.
 * Las monedas se cuentan como un total aparte (`coins`): contarlas una por
 * una no aporta control y suma clics.
 */
export const ARS_BILL_DENOMINATIONS: readonly number[] = [
  2_000_000, // $20.000
  1_000_000, // $10.000
  200_000, // $2.000
  100_000, // $1.000
  50_000, // $500
  20_000, // $200
  10_000, // $100
]

export const MAX_DENOMINATION_COUNT = 100_000

/** Total del conteo en centavos. Lanza si el conteo es inválido. */
export function sumDenominations(count: readonly CashDenominationCount[], coins = 0): number {
  if (!Number.isSafeInteger(coins) || coins < 0) throw new Error("Monto de monedas inválido")
  const seen = new Set<number>()
  let total = coins
  for (const row of count) {
    if (!ARS_BILL_DENOMINATIONS.includes(row.value)) throw new Error("Denominación desconocida")
    if (seen.has(row.value)) throw new Error("Denominación repetida")
    seen.add(row.value)
    if (!Number.isSafeInteger(row.count) || row.count < 0 || row.count > MAX_DENOMINATION_COUNT) {
      throw new Error("Cantidad de billetes inválida")
    }
    total += row.value * row.count
  }
  return total
}

/** Roles POS que ven el saldo esperado y el reporte X (cierre ciego para el resto). */
export function canSeeExpectedCash(posRole: string | null | undefined): boolean {
  return posRole === "admin" || posRole === "manager"
}

/** Roles POS que pueden aprobar operaciones sensibles con su PIN. */
export function isApproverRole(posRole: string | null | undefined): boolean {
  return posRole === "admin" || posRole === "manager"
}

/** Motivos de anulación (el Z y la auditoría los agrupan). */
export const VOID_REASONS = ["load_error", "customer_left", "complaint", "other"] as const
export type VoidReason = (typeof VOID_REASONS)[number]

export const VOID_REASON_LABELS: Readonly<Record<VoidReason, string>> = {
  load_error: "Error de carga",
  customer_left: "El cliente se fue",
  complaint: "Reclamo",
  other: "Otro",
}

export function isVoidReason(value: unknown): value is VoidReason {
  return typeof value === "string" && (VOID_REASONS as readonly string[]).includes(value)
}
