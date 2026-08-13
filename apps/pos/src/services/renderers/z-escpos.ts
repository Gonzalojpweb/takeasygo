import type { ZReport, PaymentMethod } from "@takeasygo/types"
import { toPesos } from "@takeasygo/business"

// ============================================================================
// Z Report — Renderer ESC/POS (impresión térmica 80mm)
// ============================================================================
// Decisión: Consenso v1 §4 — Renderer que genera buffer ESC/POS a partir
// del ZReport persistido. Nunca recalcula — lee del snapshot.
//
// Formato: texto plano + comandos ESC/POS básicos.
// Ancho máximo: 48 caracteres (80mm) o 32 caracteres (58mm).
// ============================================================================

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  mercadopago: "MercadoPago",
  posnet_debit: "POSNET Débito",
  posnet_credit: "POSNET Crédito",
  kripton: "Kripton",
  transfer: "Transferencia",
}

interface RenderOptions {
  tenantName: string
  locationName?: string
  ticketWidth?: 48 | 32
}

/**
 * Renderiza el ZReport como buffer ESC/POS para impresora térmica.
 *
 * @param zReport - Snapshot inmutable del cierre
 * @param options - Nombre del tenant, ubicación, ancho del ticket
 * @returns String con comandos ESC/POS listos para enviar a impresora
 */
export function renderZEscPos(zReport: ZReport, options: RenderOptions): string {
  const { tenantName, locationName, ticketWidth = 48 } = options
  const w = ticketWidth
  const lines: string[] = []

  const hr = "=".repeat(w)
  const hrThin = "-".repeat(w)

  // ── Encabezado ───────────────────────────────────────────────────
  lines.push(center(tenantName, w))
  if (locationName) lines.push(center(locationName, w))
  lines.push(center("REPORTE DE CIERRE Z", w))
  lines.push(hr)
  lines.push("")

  // ── Info general ─────────────────────────────────────────────────
  lines.push(`Fecha: ${formatDate(zReport.closedAt)}`)
  lines.push(`Cajero: ${zReport.closedBy}`)
  lines.push(`Caja: ${zReport.registerId.slice(0, 8).toUpperCase()}`)
  lines.push("")

  // ── Totales generales ────────────────────────────────────────────
  lines.push(hrThin)
  lines.push("  TOTALES GENERALES")
  lines.push(hrThin)
  pushkv(lines, "Monto inicial:", formatCurrency(zReport.initialAmount, w), w)
  pushkv(lines, "Saldo esperado:", formatCurrency(zReport.expectedAmount, w), w)
  pushkv(lines, "Saldo físico:", formatCurrency(zReport.finalAmount, w), w)
  lines.push("")
  const diffLabel = zReport.difference >= 0 ? "Sobrante:" : "Faltante:"
  pushkv(lines, diffLabel, formatCurrency(Math.abs(zReport.difference), w), w)
  lines.push("")

  // ── Ventas por canal ─────────────────────────────────────────────
  lines.push(hrThin)
  lines.push("  VENTAS POR CANAL")
  lines.push(hrThin)
  const { counter, takeasygo } = zReport.byChannel
  pushkv(lines, `Mostrador (${counter.movementCount} ops):`, formatCurrency(counter.sales, w), w)
  pushkv(lines, `TakeasyGO (${takeasygo.movementCount} ops):`, formatCurrency(takeasygo.sales, w), w)
  lines.push("")

  // ── Ventas por método de pago ────────────────────────────────────
  lines.push(hrThin)
  lines.push("  VENTAS POR MÉTODO DE PAGO")
  lines.push(hrThin)
  for (const [method, total] of Object.entries(zReport.byPaymentMethod)) {
    const label = PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method
    pushkv(lines, `${label}:`, formatCurrency(total, w), w)
  }
  lines.push("")

  // ── Resumen de movimientos ───────────────────────────────────────
  lines.push(hrThin)
  lines.push("  MOVIMIENTOS")
  lines.push(hrThin)
  pushkv(lines, "Total movimientos:", `${zReport.totalMovements}`, w)
  pushkv(lines, "Ingresos:", formatCurrency(zReport.incomeTotal, w), w)
  pushkv(lines, "Egresos:", formatCurrency(zReport.expenseTotal, w), w)
  pushkv(lines, "Ventas:", formatCurrency(zReport.salesTotal, w), w)
  pushkv(lines, "Reembolsos:", formatCurrency(zReport.refundTotal, w), w)
  lines.push("")

  // ── Footer ───────────────────────────────────────────────────────
  lines.push(hr)
  lines.push(center("Este reporte es inmutable", w))
  lines.push(center("una vez generado.", w))
  lines.push(center("Cierre de caja definitivo.", w))
  lines.push(hr)
  lines.push("")

  // ── Comando de corte ─────────────────────────────────────────────
  lines.push("\x1D\x56\x00") // GS V 0 — corte de papel

  return lines.join("\n")
}

// ============================================================================
// Helpers de formato
// ============================================================================

function center(text: string, width: number): string {
  if (text.length >= width) return text
  const pad = Math.floor((width - text.length) / 2)
  return " ".repeat(pad) + text
}

function formatCurrency(amount: number, _width: number): string {
  return `$${toPesos(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + "  " + date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Helper para líneas key-value alineadas a la derecha.
 * Ejemplo: "  Efectivo:          $62.400,00"
 */
function pushkv(lines: string[], key: string, value: string, width: number): void {
  const maxValWidth = Math.floor(width * 0.45)
  const valStr = value.length > maxValWidth ? value.slice(0, maxValWidth) : value
  const keyWidth = width - valStr.length - 1
  lines.push(key.padEnd(keyWidth) + " " + valStr)
}
