// ============================================================================
// Printer Adapter — Interfaz abstracta de impresión
// ============================================================================
// Decisión: Consenso v1 §5 — Sin decisión cerrada sobre printer agent.
// Esta interfaz abstrae la decisión. Cuando se resuelva (QZ Tray, Electron,
// etc.), solo hay que implementar el adapter correcto.
//
// El renderer ESC/POS (z-escpos.ts) genera el buffer de comandos.
// Esta capa se encarga de enviarlo a la impresora física.
// ============================================================================

/**
 * Interfaz que todo adapter de impresora debe implementar.
 *
 * @example
 * ```ts
 * // Implementación placeholder (desarrollo)
 * class ConsolePrinter implements PrinterAdapter {
 *   async print(buffer: string) { console.log('[PRINTER]', buffer) }
 *   async isAvailable() { return false }
 * }
 *
 * // Implementación real (QZ Tray, Electron, etc.)
 * class QZTrayPrinter implements PrinterAdapter {
 *   async print(buffer: string) { await qz.print(buffer) }
 *   async isAvailable() { return qz.isActive() }
 * }
 * ```
 */
export interface PrinterAdapter {
  /**
   * Envía un buffer de comandos ESC/POS a la impresora.
   * @param buffer - String con comandos ESC/POS generados por renderZEscPos()
   */
  print(buffer: string): Promise<void>

  /**
   * Verifica si la impresora está disponible y conectada.
   * @returns true si la impresora responde
   */
  isAvailable(): Promise<boolean>
}

/**
 * Adapter placeholder para desarrollo.
 * Imprime a consola en vez de enviar a una impresora real.
 */
export class ConsolePrinter implements PrinterAdapter {
  async print(buffer: string): Promise<void> {
    console.log("[PRINTER:CONSOLE] Buffer ESC/POS:")
    console.log(buffer)
  }

  async isAvailable(): Promise<boolean> {
    return false
  }
}

// ── Instancia singleton ──────────────────────────────────────────────
// Se reemplaza con el adapter real cuando se resuelva la decisión
// del printer agent (Consenso §5).

let printerInstance: PrinterAdapter = new ConsolePrinter()

/**
 * Obtiene la instancia actual del printer adapter.
 */
export function getPrinter(): PrinterAdapter {
  return printerInstance
}

/**
 * Reemplaza el printer adapter (para configuración o testing).
 */
export function setPrinter(adapter: PrinterAdapter): void {
  printerInstance = adapter
}
