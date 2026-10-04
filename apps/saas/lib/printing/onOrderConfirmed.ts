import Printer from '@/models/Printer'
import { buildPrintPayload } from './buildPrintPayload'
import { isBarraPrinter } from './barra'
import type { IOrder } from '@/models/Order'

// ============================================================================
// onOrderConfirmed
// ============================================================================
// Hook que se ejecuta cuando una orden pasa a 'confirmed'. Genera los
// printJobs[] pre-renderizados para cada impresora activa de la sede.
//
// ── EFECTIVO + BARRA (pase barra-first) ──────────────────────────────────────
// Si el método es 'cash' y la sede tiene impresoras BARRA (nombre con "barra"
// o rol 'bar'), la comanda se imprime SOLO en la BARRA y la impresión en
// cocina queda diferida (kitchenPrintDeferred = true): el cajero decide en el
// modal al pasar a preparación. Si por roles la BARRA no produciría ningún
// ticket (ej. pedido 100% comida con una BARRA que no tiene rol kitchen/
// cashier), se fuerza un ticket COMPLETO — el pedido nunca se salta la barra.
// Sin impresoras BARRA, el pedido imprime en todas (flujo histórico).
//
// Los pedidos no-efectivo no se tocan: imprimen en todas las impresoras.
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
  type BuildPrinters = Parameters<typeof buildPrintPayload>[1]
  try {
    const activePrinters = await Printer.find({
      tenantId: order.tenantId,
      locationId: order.locationId,
      isActive: true,
    }).lean()

    if (activePrinters.length === 0) return

    // ── Efectivo: pase BARRA-first ──────────────────────────────────────
    if (order.payment?.method === 'cash') {
      const barraPrinters = activePrinters.filter(isBarraPrinter)
      if (barraPrinters.length > 0) {
        let printJobs = await buildPrintPayload(order, barraPrinters as unknown as BuildPrinters)
        if (printJobs.length === 0) {
          // Ticket resumen: el pedido igual tiene que pasar por la BARRA
          printJobs = await buildPrintPayload(order, barraPrinters as unknown as BuildPrinters, {
            forceAllItems: true,
          })
        }

        order.kitchenPrintDeferred = true
        if (printJobs.length > 0) {
          order.printJobs = printJobs
          // Sincronizar campo legacy
          order.printed = false // Hay jobs pendientes, no está impresa aún
        }

        await order.save()
        return
      }
      // Sin impresoras BARRA → flujo histórico (todas las impresoras)
    }

    const printJobs = await buildPrintPayload(order, activePrinters as unknown as BuildPrinters)

    if (printJobs.length === 0) return

    order.printJobs = printJobs

    // Sincronizar campo legacy
    order.printed = false // Hay jobs pendientes, no está impresa aún

    await order.save()
  } catch (err) {
    // No fallar la confirmación por un error de printing
    console.error('[onOrderConfirmed] Error generando print jobs:', err)
  }
}
