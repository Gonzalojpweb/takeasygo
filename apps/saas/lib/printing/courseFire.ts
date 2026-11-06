import { TicketBuilder } from './escpos-builder'
import type { CodepageName } from './encoding'
import type { IPrintJob } from '@/models/Order'
import type { Types } from 'mongoose'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'

// ============================================================================
// «MARCHA PRINCIPAL» — ticket corto de la marcha del mozo (piloto 06/11/2026)
// ============================================================================
// La cocina ya tiene los platos (salieron en la comanda con «EN ESPERA»).
// La marcha NO los repite: imprime solo el aviso grande, la mesa, la orden,
// cuántos platos marchan y quién marchó. Sale en cada estación que tiene
// platos de ese tiempo (cocina y/o barra).
// ============================================================================

const FIRE_LABEL: Record<string, string> = { entrada: 'ENTRADA', principal: 'PRINCIPAL', postre: 'POSTRE' }

interface FirePrinter {
  _id: Types.ObjectId
  name: string
  paperWidth?: number
  codepage?: CodepageName
  roles?: string[]
}

interface FireOrder {
  orderNumber: string
  posTableNumber?: number | null
  items: { itemType?: string; course?: string | null; printRole?: string | null; quantity: number }[]
}

export function renderCourseFireTicket(args: {
  course: string
  order: FireOrder
  printer: FirePrinter
  plates: number
  firedBy?: string | null
  at: Date
  timezone?: string
}): Buffer {
  const { course, order, printer, plates, firedBy, at } = args
  const t = new TicketBuilder({
    paperWidth: printer.paperWidth === 58 ? 384 : 576,
    fontSize: 'large',
    codepage: printer.codepage,
  })
  t.ruleDouble()
  t.text('MARCHA', { bold: true, size: 'triple', align: 'center' })
  t.text(FIRE_LABEL[course] ?? course.toUpperCase(), { bold: true, size: 'triple', align: 'center' })
  t.ruleDouble()
  if (typeof order.posTableNumber === 'number') {
    t.text(`MESA ${order.posTableNumber}`, { bold: true, size: 'triple', align: 'center' })
  }
  t.text(`Orden ${order.orderNumber}`, { align: 'center', size: 'normal' })
  t.text(`${plates} plato${plates === 1 ? '' : 's'} en espera`, { align: 'center', bold: true })
  const time = at.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: args.timezone || DEFAULT_TIMEZONE })
  t.text(`${time} hs${firedBy ? ` - ${firedBy}` : ''}`, { align: 'center', size: 'normal' })
  t.cut()
  return t.toBuffer()
}

/** Platos de ese tiempo que le tocan a la estación. */
function platesFor(order: FireOrder, course: string, role: string): number {
  return order.items
    .filter((i) => i.itemType !== 'combo' && i.course === course)
    .filter((i) => (role === 'kitchen' ? !i.printRole || i.printRole === 'kitchen' || i.printRole === 'both' : i.printRole === 'bar' || i.printRole === 'both'))
    .reduce((s, i) => s + i.quantity, 0)
}

/** Un job por estación (cocina / barra) que tiene platos de ese tiempo. */
export function buildCourseFireJobs(args: {
  course: string
  order: FireOrder
  printers: FirePrinter[]
  firedBy?: string | null
  at?: Date
  timezone?: string
}): IPrintJob[] {
  const at = args.at ?? new Date()
  const jobs: IPrintJob[] = []
  for (const printer of args.printers) {
    for (const role of printer.roles ?? []) {
      if (role !== 'kitchen' && role !== 'bar') continue
      const plates = platesFor(args.order, args.course, role)
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
