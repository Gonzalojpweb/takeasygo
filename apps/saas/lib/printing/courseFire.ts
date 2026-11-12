import { TicketBuilder } from './escpos-builder'
import { buildCourseFireTicket, firePlatesFor, type FireOrder, type FirePrinter } from '@takeasygo/business/escpos'
import type { IPrintJob } from '@/models/Order'
import type { Types } from 'mongoose'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'

// ============================================================================
// «MARCHA PRINCIPAL» — ticket corto de la marcha del mozo (piloto 06/11/2026)
// ============================================================================
// El ticket vive en @takeasygo/business (escpos/course-fire.ts) desde la
// etapa 4 del POS offline: el POS imprime la misma marcha sin internet. Acá
// se arman los jobs de la cola del agente (uno por estación con platos).
// ============================================================================

export function renderCourseFireTicket(args: {
  course: string
  order: FireOrder
  printer: FirePrinter
  plates: number
  firedBy?: string | null
  at: Date
  timezone?: string
}): Buffer {
  return buildCourseFireTicket({ ...args, timezone: args.timezone || DEFAULT_TIMEZONE }, (opts) => new TicketBuilder(opts)).toBuffer()
}

/** Un job por estación (cocina / barra) que tiene platos de ese tiempo. */
export function buildCourseFireJobs(args: {
  course: string
  order: FireOrder
  printers: (FirePrinter & { _id: Types.ObjectId })[]
  firedBy?: string | null
  at?: Date
  timezone?: string
}): IPrintJob[] {
  const at = args.at ?? new Date()
  const jobs: IPrintJob[] = []
  for (const printer of args.printers) {
    for (const role of printer.roles ?? []) {
      if (role !== 'kitchen' && role !== 'bar') continue
      const plates = firePlatesFor(args.order, args.course, role)
      if (plates === 0) continue
      const buffer = renderCourseFireTicket({ course: args.course, order: args.order, printer, plates, firedBy: args.firedBy, at, timezone: args.timezone })
      jobs.push({
        printerId: printer._id,
        printerName: printer.name,
        role,
        payload: buffer.toString('base64'),
        status: 'pending',
        attempts: 0,
        lastError: null,
        printedAt: null,
      } as IPrintJob)
    }
  }
  return jobs
}
