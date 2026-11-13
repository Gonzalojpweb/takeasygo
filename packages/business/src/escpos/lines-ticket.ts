import { toPesos } from "../money"
import { encodeEscPosText } from "./encoding"

// ============================================================================
// Tickets «por líneas» (Z de caja y precuenta) — compartido server ↔ POS
// ============================================================================
// POS offline V2 — etapa 5 (12/11/2026). Es el armado que vivía en
// apps/saas/lib/cash/z-ticket.ts (escPosFromLines) y la precuenta de
// apps/saas/lib/pos-online/precuenta.ts: el equipo sin internet imprime la
// precuenta con los mismos bytes. CP858, corte al final.
// ============================================================================

export type TicketLine = { text: string; bold?: boolean; center?: boolean; large?: boolean }

const CMD = {
  INIT: [0x1b, 0x40],
  CODE_PAGE: [0x1b, 0x74, 43], // CP858
  CUT: [0x1d, 0x56, 0x01],
  BOLD_ON: [0x1b, 0x45, 0x01],
  BOLD_OFF: [0x1b, 0x45, 0x00],
  ALIGN_LEFT: [0x1b, 0x61, 0x00],
  ALIGN_CENTER: [0x1b, 0x61, 0x01],
  SIZE_NORMAL: [0x1d, 0x21, 0x00],
  SIZE_LARGE: [0x1d, 0x21, 0x11],
}

const NON_LATIN1_RE = /[^\u0000-ÿ€]/g
const enc = (text: string): number[] => Array.from(encodeEscPosText(text.replace(NON_LATIN1_RE, ""), "cp858"))

export function ticketMoney(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  return `${sign}$${toPesos(Math.abs(cents)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Líneas de texto → bytes ESC/POS (CP858, interlineado 36, corte al final). */
export function linesToEscPosBytes(lines: TicketLine[]): Uint8Array {
  const out: number[] = [...CMD.INIT, ...CMD.CODE_PAGE, 0x1b, 0x33, 36]
  for (const line of lines) {
    out.push(...(line.center ? CMD.ALIGN_CENTER : CMD.ALIGN_LEFT))
    if (line.large) out.push(...CMD.SIZE_LARGE)
    if (line.bold) out.push(...CMD.BOLD_ON)
    out.push(...enc(`${line.text}\n`))
    if (line.bold) out.push(...CMD.BOLD_OFF)
    if (line.large) out.push(...CMD.SIZE_NORMAL)
  }
  out.push(...enc("\n\n"), ...CMD.CUT)
  return Uint8Array.from(out)
}

// ── Precuenta de la mesa ─────────────────────────────────────────────────────

export interface PrecuentaItem {
  name: string
  quantity: number
  /** Importe neto de la línea (ya con descuento), centavos. */
  subtotal: number
  /** Centavos descontados de la línea (0 si no tiene). */
  discountCents: number
}

export interface PrecuentaData {
  locationName: string
  tableNumber: number
  guests: number | null
  items: PrecuentaItem[]
  at: Date
  timezone?: string
  /** 32 (58 mm) o 48 (80 mm). */
  columns: number
}

/** Líneas del ticket (sin códigos de control): base del buffer y de los tests. */
export function precuentaLines(data: PrecuentaData): TicketLine[] {
  const cols = data.columns
  const row = (label: string, value: string, bold = false): TicketLine => {
    const room = cols - value.length - 1
    const left = label.length > room ? label.slice(0, room) : label
    return { text: `${left}${" ".repeat(Math.max(1, cols - left.length - value.length))}${value}`, bold }
  }
  const rule = { text: "-".repeat(cols) }
  const when = data.at.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: data.timezone || "America/Argentina/Buenos_Aires",
  })

  const gross = data.items.reduce((s, i) => s + i.subtotal + i.discountCents, 0)
  const discounts = data.items.reduce((s, i) => s + i.discountCents, 0)
  const total = data.items.reduce((s, i) => s + i.subtotal, 0)

  const out: TicketLine[] = [
    { text: data.locationName.toUpperCase(), bold: true, center: true },
    { text: "PRECUENTA", bold: true, center: true, large: true },
    { text: `Mesa ${data.tableNumber}${data.guests ? ` - ${data.guests} ${data.guests === 1 ? "comensal" : "comensales"}` : ""}`, center: true },
    { text: when, center: true },
    rule,
  ]
  for (const item of data.items) {
    out.push(row(`${item.quantity}x ${item.name}`, ticketMoney(item.subtotal + item.discountCents)))
    if (item.discountCents > 0) out.push(row("   Descuento", `-${ticketMoney(item.discountCents)}`))
  }
  out.push(rule)
  if (discounts > 0) {
    out.push(row("Subtotal", ticketMoney(gross)))
    out.push(row("Descuentos", `-${ticketMoney(discounts)}`))
  }
  out.push({ ...row("TOTAL", ticketMoney(total), true), large: false })
  if (data.guests && data.guests > 1) {
    out.push(row(`Por persona (${data.guests})`, ticketMoney(Math.ceil(total / data.guests))))
  }
  out.push(
    rule,
    { text: "NO VALIDO COMO FACTURA", center: true, bold: true },
    { text: "Gracias por su visita", center: true },
    { text: "" }
  )
  return out
}
