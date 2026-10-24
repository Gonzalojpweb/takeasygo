// ============================================================================
// Aprobación de encargado — puente entre posApi y el diálogo de PIN
// ============================================================================
// Fase 1 de caja (2026-10). Cuando el server responde `approval_required`
// (anular una venta, retirar efectivo, cancelar un pedido en cocina, quitar
// un producto comandado), posApi pide el PIN acá y reintenta la MISMA
// petición con el header `X-Manager-Pin`. Ninguna pantalla tiene que saber
// de aprobaciones: el diálogo aparece solo cuando hace falta.
//
// Un solo pedido a la vez: si llegan dos (no debería), comparten respuesta.
// El PIN nunca se guarda: vive en memoria lo que dura el reintento.
// ============================================================================

export interface ApprovalPrompt {
  /** Qué se está aprobando (texto del server). */
  message: string
  /** Error del intento anterior (PIN incorrecto), si lo hubo. */
  error: string | null
}

type Listener = (prompt: ApprovalPrompt | null) => void

let current: { prompt: ApprovalPrompt; resolve: (pin: string | null) => void } | null = null
const listeners = new Set<Listener>()

function emit() {
  const prompt = current?.prompt ?? null
  listeners.forEach((l) => l(prompt))
}

export function subscribeApproval(listener: Listener): () => void {
  listeners.add(listener)
  listener(current?.prompt ?? null)
  return () => listeners.delete(listener)
}

/** Pide el PIN de un encargado. Resuelve con el PIN o null si se canceló. */
export function requestManagerPin(prompt: ApprovalPrompt): Promise<string | null> {
  if (current) {
    // Ya hay un pedido abierto: se actualiza el texto y se encadena.
    const previous = current
    return new Promise((resolve) => {
      const chained = previous.resolve
      previous.resolve = (pin) => {
        chained(pin)
        resolve(pin)
      }
      previous.prompt = prompt
      emit()
    })
  }
  return new Promise((resolve) => {
    current = { prompt, resolve }
    emit()
  })
}

/** Lo llama el diálogo. */
export function answerApproval(pin: string | null): void {
  const pending = current
  current = null
  emit()
  pending?.resolve(pin)
}

/** Intentos de PIN por operación antes de abandonarla. */
export const MAX_APPROVAL_ATTEMPTS = 3
