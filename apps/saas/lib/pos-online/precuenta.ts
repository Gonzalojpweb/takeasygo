import mongoose from 'mongoose'
import { printerForDocument } from '@/lib/printers/select'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { escPosFromLines, money, type TicketLine } from '@/lib/cash/z-ticket'

// ============================================================================
// Precuenta de la mesa (Fase E, 2026-10)
// ============================================================================
// Al pedir la cuenta, la impresora de CAJA saca la precuenta: platos de todas
// las rondas sin cobrar, descuentos, total y (con comensales) el importe por
// persona. NO es comprobante fiscal: lo dice el ticket.
// Canal: el mismo `PreClosePrintJob` que el Z (lib/cash/z-print): buffer
// ESC/POS listo que el printer-agent del local imprime en su próximo ciclo.
// ============================================================================

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
    return { text: `${left}${' '.repeat(Math.max(1, cols - left.length - value.length))}${value}`, bold }
  }
  const rule = { text: '-'.repeat(cols) }
  const when = data.at.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: data.timezone || DEFAULT_TIMEZONE,
  })

  const gross = data.items.reduce((s, i) => s + i.subtotal + i.discountCents, 0)
  const discounts = data.items.reduce((s, i) => s + i.discountCents, 0)
  const total = data.items.reduce((s, i) => s + i.subtotal, 0)

  const out: TicketLine[] = [
    { text: data.locationName.toUpperCase(), bold: true, center: true },
    { text: 'PRECUENTA', bold: true, center: true, large: true },
    { text: `Mesa ${data.tableNumber}${data.guests ? ` - ${data.guests} ${data.guests === 1 ? 'comensal' : 'comensales'}` : ''}`, center: true },
    { text: when, center: true },
    rule,
  ]
  for (const item of data.items) {
    out.push(row(`${item.quantity}x ${item.name}`, money(item.subtotal + item.discountCents)))
    if (item.discountCents > 0) out.push(row('   Descuento', `-${money(item.discountCents)}`))
  }
  out.push(rule)
  if (discounts > 0) {
    out.push(row('Subtotal', money(gross)))
    out.push(row('Descuentos', `-${money(discounts)}`))
  }
  out.push({ ...row('TOTAL', money(total), true), large: false })
  if (data.guests && data.guests > 1) {
    out.push(row(`Por persona (${data.guests})`, money(Math.ceil(total / data.guests))))
  }
  out.push(
    rule,
    { text: 'NO VALIDO COMO FACTURA', center: true, bold: true },
    { text: 'Gracias por su visita', center: true },
    { text: '' }
  )
  return out
}

export type PrecuentaPrintResult = { ok: true; printerName: string; total: number } | { ok: false; reason: 'no_printer' | 'empty' }

export async function enqueuePrecuenta(input: {
  tenantId: string
  locationId: string
  tableNumber: number
  guests: number | null
  items: PrecuentaItem[]
}): Promise<PrecuentaPrintResult> {
  if (input.items.length === 0) return { ok: false, reason: 'empty' }
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const locationId = new mongoose.Types.ObjectId(input.locationId)

  const printer = await printerForDocument(tenantId, locationId, 'precuenta')
  if (!printer) return { ok: false, reason: 'no_printer' }

  const [tenant, location] = await Promise.all([
    Tenant.findById(tenantId).select('name').lean<{ name: string }>(),
    Location.findOne({ _id: locationId, tenantId }).select('name timezone').lean<{ name: string; timezone?: string }>(),
  ])
  const wide = printer.paperWidth === 80 || printer.paperWidth >= 576
  const data = escPosFromLines(
    precuentaLines({
      locationName: location?.name ?? tenant?.name ?? '',
      tableNumber: input.tableNumber,
      guests: input.guests,
      items: input.items,
      at: new Date(),
      timezone: location?.timezone,
      columns: wide ? 48 : 32,
    })
  )

  await PreClosePrintJob.create({
    kind: 'precuenta',
    tenantId,
    locationId,
    printerName: printer.name,
    connectionType: printer.connectionType,
    ip: printer.ip,
    port: printer.port,
    paperWidth: wide ? 80 : 58,
    data,
    status: 'pending',
  })
  return { ok: true, printerName: printer.name, total: input.items.reduce((s, i) => s + i.subtotal, 0) }
}
