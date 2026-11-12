// ============================================================================
// Trabajo local en curso por operación (etapa 4: impresión sin internet)
// ============================================================================
// Mientras el POS imprime la comanda de una operación offline, el reenvío no
// la manda: si saliera antes, el server no sabría que ya se imprimió y la
// cocina recibiría la comanda dos veces. Sin dependencias (lo usa replay).
// ============================================================================

const inFlight = new Set<string>()

export function beginLocalWork(opId: string): void {
  inFlight.add(opId)
}

export function endLocalWork(opId: string): void {
  inFlight.delete(opId)
}

export function isLocalWorkPending(opId: string): boolean {
  return inFlight.has(opId)
}
