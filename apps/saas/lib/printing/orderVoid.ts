import { TicketBuilder } from './escpos-builder'
import { buildOrderVoidTicket, voidItemsFor, type FirePrinter, type VoidTicketItem } from '@takeasygo/business/escpos'
import type { IPrintJob } from '@/models/Order'
import type { Types } from 'mongoose'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'

// ============================================================================
// «ANULADA» — aviso a cocina/barra de una ronda anulada (19/11/2026)
// ============================================================================
// Un job por estación que había recibido platos de la ronda. Los jobs van
// con `isReprint: true` a propósito: el agente de impresión solo entrega los
// jobs automáticos de órdenes activas (confirmed/preparing/ready) y esta
// orden ya quedó `cancelled`; `isReprint` = «impresión explícita, entregar
// ya, en cualquier estado» (app/api/[tenant]/print-jobs).
// ============================================================================

export function buildOrderVoidJobs(args: {
  order: { orderNumber: string; posTableNumber?: number | null; items: VoidTicketItem[] }
  printers: (FirePrinter & { _id: Types.ObjectId })[]
  reasonLabel: string
  by?: string | null
  at?: Date
  timezone?: string
}): IPrintJob[] {
  const at = args.at ?? new Date()
  const jobs: IPrintJob[] = []
  for (const printer of args.printers) {
    for (const role of printer.roles ?? []) {
      if (role !== 'kitchen' && role !== 'bar') continue
      const items = voidItemsFor(args.order.items, role)
      if (items.length === 0) continue
      const buffer = buildOrderVoidTicket(
        {
          order: args.order,
          items,
          printer,
          reasonLabel: args.reasonLabel,
          by: args.by,
          at,
          timezone: args.timezone || DEFAULT_TIMEZONE,
        },
        (opts) => new TicketBuilder(opts)
      ).toBuffer()
      jobs.push({
        printerId: printer._id,
        printerName: printer.name,
        role,
        payload: buffer.toString('base64'),
        status: 'pending',
        attempts: 0,
        lastError: null,
        printedAt: null,
        isReprint: true,
      } as IPrintJob)
    }
  }
  return jobs
}
