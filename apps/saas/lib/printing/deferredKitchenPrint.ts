import Printer from '@/models/Printer'
import { buildPrintPayload } from './buildPrintPayload'
import { isBarraPrinter } from './barra'
import type { IOrder } from '@/models/Order'

// ============================================================================
// settleDeferredKitchenPrint
// ============================================================================
// Resuelve la impresión en cocina diferida de un pedido en efectivo.
//
// El pedido cash imprimió primero en la BARRA (onOrderConfirmed) con
// kitchenPrintDeferred = true. Al pasar a preparación el cajero decide en el
// modal si la comanda va a cocina ahora:
//   - print: true  → genera printJobs para TODAS las impresoras no-BARRA
//     (cocina con items cocina, receipt de caja, etc. — filtro de rol
//     estándar; la BARRA no recibe nada nuevo porque ya la vio).
//   - print: false → solo limpia el flag (el admin puede reimprimir a mano
//     desde el panel si cambia de idea).
//
// También se usa con print: false al cancelar, para no dejar el flag huerfano.
// Devuelve true si se agregaron jobs nuevos.
// ============================================================================

export async function settleDeferredKitchenPrint(
  order: IOrder,
  opts: { print?: boolean } = {}
): Promise<boolean> {
  const { print = true } = opts

  if (!order.kitchenPrintDeferred) return false
  order.kitchenPrintDeferred = false

  if (order.payment?.method !== 'cash') return false
  if (!print) return false

  const activePrinters = await Printer.find({
    tenantId: order.tenantId,
    locationId: order.locationId,
    isActive: true,
  }).lean()

  const printers = activePrinters.filter((p) => !isBarraPrinter(p))
  if (printers.length === 0) return false

  const newJobs = await buildPrintPayload(
    order,
    printers as unknown as Parameters<typeof buildPrintPayload>[1]
  )
  if (newJobs.length === 0) return false

  if (!order.printJobs) order.printJobs = []
  for (const job of newJobs) {
    order.printJobs.push(job)
  }
  order.printed = false
  return true
}
