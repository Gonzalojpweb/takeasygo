import mongoose from 'mongoose'
import { effectiveDocuments, type PrinterDocument } from '@takeasygo/business'
import Printer from '@/models/Printer'

// ============================================================================
// ¿Qué impresora de la sede imprime este documento? (Fase 1, 29/10/2026)
// ============================================================================
// Reemplaza el viejo «la primera con rol caja». Orden por nombre (estable);
// una impresora sin `documents` imprime los de su rol, así que las sedes
// configuradas antes siguen igual.
// ============================================================================

export interface PrinterTarget {
  _id: mongoose.Types.ObjectId
  name: string
  connectionType: 'tcp' | 'usb'
  ip: string
  port: number
  paperWidth: number
}

export async function printerForDocument(
  tenantId: unknown,
  locationId: unknown,
  doc: PrinterDocument
): Promise<PrinterTarget | null> {
  const printers = await Printer.find({
    tenantId: new mongoose.Types.ObjectId(String(tenantId)),
    locationId: new mongoose.Types.ObjectId(String(locationId)),
    isActive: true,
  })
    .sort({ name: 1 })
    .select('name connectionType ip port paperWidth roles documents')
    .lean<(PrinterTarget & { roles?: string[]; documents?: string[] })[]>()
  return printers.find((p) => effectiveDocuments(p).includes(doc)) ?? null
}
