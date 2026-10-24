import mongoose from 'mongoose'
import Printer from '@/models/Printer'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import type { ZReport } from '@takeasygo/types'
import { buildZTicketBuffer } from './z-ticket'

// ============================================================================
// Imprimir el Z en la impresora de caja de la sede (Fase 2 de caja, 2026-10)
// ============================================================================
// Reusa el canal del cierre de turno: un `PreClosePrintJob` con el buffer
// ESC/POS listo que el printer-agent del local imprime en su próximo ciclo.
// Impresora: la activa de la sede con rol `cashier` (la primera por nombre).
// ============================================================================

export interface ZPrintRegister {
  tenantId: unknown
  locationId: unknown
  openedAt: Date
  zReport: unknown
}

export type ZPrintResult =
  | { ok: true; printerName: string }
  | { ok: false; reason: 'no_printer' | 'no_z' }

export async function enqueueZPrint(register: ZPrintRegister, options: { reprint?: boolean } = {}): Promise<ZPrintResult> {
  if (!register.zReport) return { ok: false, reason: 'no_z' }
  const tenantId = new mongoose.Types.ObjectId(String(register.tenantId))
  const locationId = new mongoose.Types.ObjectId(String(register.locationId))

  const printer = await Printer.findOne({ tenantId, locationId, isActive: true, roles: 'cashier' })
    .sort({ name: 1 })
    .lean<{ name: string; connectionType: 'tcp' | 'usb'; ip: string; port: number; paperWidth: number }>()
  if (!printer) return { ok: false, reason: 'no_printer' }

  const [tenant, location] = await Promise.all([
    Tenant.findById(tenantId).select('name').lean<{ name: string }>(),
    Location.findOne({ _id: locationId, tenantId }).select('name timezone').lean<{ name: string; timezone?: string }>(),
  ])

  // paperWidth: 80/58 (mm) o 576/384 (px) según la versión del modelo.
  const wide = printer.paperWidth === 80 || printer.paperWidth >= 576
  const data = buildZTicketBuffer(register.zReport as ZReport, {
    tenantName: tenant?.name ?? '',
    locationName: location?.name ?? tenant?.name ?? 'Caja',
    openedAt: register.openedAt,
    columns: wide ? 48 : 32,
    timezone: location?.timezone,
    reprint: options.reprint,
  })

  await PreClosePrintJob.create({
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
  return { ok: true, printerName: printer.name }
}
