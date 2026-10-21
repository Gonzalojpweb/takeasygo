import { toCents, toPesos } from "@takeasygo/business/browser"

/**
 * Lo que el cajero tipea (PESOS, como lo ve en pantalla) → centavos enteros,
 * que es lo único que acepta el server (assertCents).
 *
 * Auditoría POS Online V1 §6.4: Caja mandaba `parseFloat(input)` crudo →
 * $1000 se guardaba como 1000 centavos ($10) y $1000,50 era rechazado.
 *
 * Acepta "1000", "1000.5", "1000,50" y "1.000,50" (con coma, el punto es
 * separador de miles). Máximo 2 decimales. Devuelve null si no es un monto
 * válido o es negativo.
 */
export function parsePesosInput(raw: string): number | null {
  let value = raw.trim().replace(/\s/g, "").replace(/^\$/, "")
  if (!value) return null
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  const cents = toCents(Number(value))
  return Number.isSafeInteger(cents) ? cents : null
}

/** Centavos → texto editable en pesos para precargar un input ("1500.5" → "1500,50"). */
export function centsToPesosInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",")
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toPesos(amount))
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return "ahora"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatOrderStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    preparing: "Preparando",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }
  return labels[status] ?? status
}

export function getStatusClass(status: string): string {
  return status
}
