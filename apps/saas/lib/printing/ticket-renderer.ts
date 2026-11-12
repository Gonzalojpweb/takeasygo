import { TicketBuilder } from './escpos-builder'
import { buildOrderTicket, type PrintOrder, type PrinterDoc } from '@takeasygo/business/escpos'

// ============================================================================
// Server-side ESC/POS Ticket Renderer
// ============================================================================
// El renderer vive en @takeasygo/business/escpos (order-ticket.ts) desde la
// etapa 4 del POS offline (12/11/2026): el POS arma sin internet la misma
// comanda. Acá solo se usa el TicketBuilder del server (iconv, Buffer).
// ============================================================================

export type { PrintOrder, PrinterDoc }

export function renderOrderTicket(
  order: PrintOrder,
  printer: PrinterDoc,
  role: string,
  options: { forceAllItems?: boolean } = {}
): Buffer | null {
  // Sin timezone de la sede se usa America/Argentina/Buenos_Aires (= DEFAULT_TIMEZONE).
  const t = buildOrderTicket(order, printer, role, options, (opts) => new TicketBuilder(opts))
  return t ? t.toBuffer() : null
}
