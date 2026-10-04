// ============================================================================
// isBarraPrinter
// ============================================================================
// Detecta las impresoras del circuito BARRA del flujo de efectivo:
//   - nombre que contiene "barra" (BARRA, Barra Central, LA BARRA, …), o
//   - con el rol 'bar' habilitado.
//
// Un pedido en efectivo imprime PRIMERO en estas impresoras (el cajero necesita
// ver la comanda antes de que llegue a cocina) y la impresión en cocina queda
// diferida a la confirmación en preparación. Los pedidos no-efectivo no usan
// esta distinción: imprimen en todas las impresoras como siempre.

export interface BarraPrinterLike {
  name?: string
  roles?: string[]
}

export function isBarraPrinter(printer: BarraPrinterLike): boolean {
  if ((printer.roles || []).includes('bar')) return true
  return /barra/i.test(printer.name ?? '')
}
