// ============================================================================
// Anular una mesa entera (sin cobrar) — 19/11/2026
// ============================================================================
// Se abrió una mesa, se comandó y, por la razón que sea, la venta no va: un
// admin o encargado la anula entera (en su equipo o tipeando su PIN en el
// del mozo/cajero). Todas las rondas abiertas quedan `cancelled` con el
// registro de la anulación (Order.tableVoid) y la mesa vuelve a libre.
//
// Inventario — lo decide el operador con una pregunta concreta:
//   · «No se llegó a preparar»  → los insumos vuelven al stock (reversión).
//   · «Se preparó y se pierde»  → los insumos van a MERMA (WasteRecorded).
// Cada motivo propone una respuesta (`wastedDefault`), que se puede cambiar.
// Solo aplica a lo que ya se mandó a cocina: una ronda sin enviar nunca
// descontó insumos.
//
// Misma lista en el server (validación) y en el POS (diálogo).
// ============================================================================

export const TABLE_VOID_REASONS = [
  "load_error",
  "customer_left",
  "complaint",
  "kitchen_issue",
  "training",
  "other",
] as const

export type TableVoidReason = (typeof TABLE_VOID_REASONS)[number]

export const TABLE_VOID_REASON_INFO: Readonly<Record<TableVoidReason, { label: string; hint: string; wastedDefault: boolean }>> = {
  load_error: { label: "Error de carga", hint: "Mesa equivocada o pedido mal cargado", wastedDefault: false },
  customer_left: { label: "El cliente se fue", hint: "Se levantó antes de consumir", wastedDefault: false },
  complaint: { label: "Reclamo o demora", hint: "No se cobra por un problema de servicio", wastedDefault: true },
  kitchen_issue: { label: "Problema en cocina", hint: "Faltante, producto agotado o equipo roto", wastedDefault: false },
  training: { label: "Prueba o capacitación", hint: "No fue una venta real", wastedDefault: false },
  other: { label: "Otro", hint: "Escribí el motivo", wastedDefault: false },
}

export function isTableVoidReason(value: unknown): value is TableVoidReason {
  return typeof value === "string" && (TABLE_VOID_REASONS as readonly string[]).includes(value)
}

/** «Otro» exige escribir el motivo (queda en el registro y la auditoría). */
export function tableVoidNeedsNote(reason: TableVoidReason): boolean {
  return reason === "other"
}

export const TABLE_VOID_NOTE_MAX = 200
