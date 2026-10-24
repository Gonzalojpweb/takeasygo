import { posApi } from "./pos-api"

// ============================================================================
// MercadoPago Point desde la caja (Fase 6)
// ============================================================================
// Si la sede tiene un posnet Point asignado, cobrar con MercadoPago manda el
// monto al posnet y la caja espera la aprobación (consulta cada 2 s, hasta 3
// minutos). El cajero puede cancelar. El server verifica el pago en
// MercadoPago por el monto exacto: el POS no decide si se aprobó.
// ============================================================================

const POLL_MS = 2000
const MAX_WAIT_MS = 3 * 60 * 1000

export interface PointWaitState {
  amountCents: number
  detail: string
  cancel: () => void
}

type Listener = (state: PointWaitState | null) => void
let current: PointWaitState | null = null
const listeners = new Set<Listener>()

function emit(state: PointWaitState | null) {
  current = state
  listeners.forEach((l) => l(state))
}

export function subscribePointWait(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}

export async function isPointEnabled(tenantId: string): Promise<boolean> {
  try {
    const { enabled } = await posApi<{ enabled: boolean }>(tenantId, "/point")
    return enabled
  } catch {
    return false
  }
}

export class PointChargeError extends Error {
  constructor(message: string, readonly canceled = false) {
    super(message)
    this.name = "PointChargeError"
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Cobra `amountCents` en el posnet. Devuelve el id de pago de MercadoPago. */
export async function chargeOnPoint(tenantId: string, orderId: string, amountCents: number): Promise<string> {
  const { intentId } = await posApi<{ intentId: string }>(tenantId, "/point", {
    method: "POST",
    body: { orderId, amount: amountCents },
  })

  let canceled = false
  const cancel = () => {
    canceled = true
  }
  emit({ amountCents, detail: "Pasá la tarjeta o el celular en el posnet", cancel })

  try {
    const started = Date.now()
    for (;;) {
      if (canceled) {
        await posApi(tenantId, `/point/${encodeURIComponent(intentId)}`, { method: "DELETE" }).catch(() => undefined)
        throw new PointChargeError("Cobro con posnet cancelado", true)
      }
      if (Date.now() - started > MAX_WAIT_MS) {
        await posApi(tenantId, `/point/${encodeURIComponent(intentId)}`, { method: "DELETE" }).catch(() => undefined)
        throw new PointChargeError("El posnet no respondió a tiempo. Probá de nuevo.")
      }
      await sleep(POLL_MS)
      const status = await posApi<{ state: string; paymentId: string | null; detail: string }>(
        tenantId,
        `/point/${encodeURIComponent(intentId)}`
      ).catch(() => ({ state: "waiting", paymentId: null, detail: "Sin conexión, reintentando…" }))
      if (status.state === "approved" && status.paymentId) return status.paymentId
      if (status.state !== "waiting") throw new PointChargeError(status.detail || "El pago no se aprobó", status.state === "canceled")
      emit({ amountCents, detail: status.detail || "Esperando la tarjeta", cancel })
    }
  } finally {
    emit(null)
  }
}
