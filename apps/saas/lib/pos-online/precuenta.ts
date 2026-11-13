import mongoose from 'mongoose'
import { printerForDocument } from '@/lib/printers/select'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { escPosFromLines } from '@/lib/cash/z-ticket'
import { precuentaLines, type PrecuentaItem } from '@takeasygo/business/escpos'

// ============================================================================
// Precuenta de la mesa (Fase E, 2026-10)
// ============================================================================
// Al pedir la cuenta, la impresora de CAJA saca la precuenta: platos de todas
// las rondas sin cobrar, descuentos, total y (con comensales) el importe por
// persona. NO es comprobante fiscal: lo dice el ticket.
// Canal: el mismo `PreClosePrintJob` que el Z (lib/cash/z-print): buffer
// ESC/POS listo que el printer-agent del local imprime en su próximo ciclo.
// ============================================================================

// Las líneas viven en @takeasygo/business/escpos (lines-ticket.ts) desde la
// etapa 5 del POS offline: el equipo sin internet imprime la misma precuenta.
export { precuentaLines, type PrecuentaItem, type PrecuentaData } from '@takeasygo/business/escpos'

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
