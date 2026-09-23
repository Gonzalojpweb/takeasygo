import Printer from '@/models/Printer'
import { buildPrintPayload } from './buildPrintPayload'
import type { IOrder } from '@/models/Order'

// ============================================================================
// onOrderConfirmed
// ============================================================================
// Hook que se ejecuta cuando una orden pasa a 'confirmed'. Genera los
// printJobs[] pre-renderizados para cada impresora activa de la sede.
//
// Uso:
//   order.status = 'confirmed'
//   await order.save()
//   await onOrderConfirmed(order)  // ← llamar DESPUÉS del save
//
// Si falla el rendering de una impresora, el job queda en 'error' y se
// reintenta en el próximo poll del agente (hasta MAX_ATTEMPTS).
// ============================================================================

export async function onOrderConfirmed(order: IOrder): Promise<void> {
  try {
    const activePrinters = await Printer.find({
      tenantId: order.tenantId,
      locationId: order.locationId,
      isActive: true,
    }).lean()

    if (activePrinters.length === 0) return

    const printJobs = await buildPrintPayload(order, activePrinters as any)

    if (printJobs.length === 0) return

    order.printJobs = printJobs as any

    // Sincronizar campo legacy
    order.printed = false // Hay jobs pendientes, no está impresa aún

    await order.save()
  } catch (err) {
    // No fallar la confirmación por un error de printing
    console.error('[onOrderConfirmed] Error generando print jobs:', err)
  }
}
