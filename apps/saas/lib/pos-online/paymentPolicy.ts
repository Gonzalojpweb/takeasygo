import { POS_PAYABLE_METHODS, type PosPayableMethod } from '@/models/Order'
import { PosError } from './errors'

// ============================================================================
// Cobro del POS — reglas puras (POST /pos/orders/[id]/payments)
// ============================================================================
// Auditoría POS Online V1 §5: solo el efectivo dejaba rastro; MP Point,
// POSNET y transferencia marcaban la orden `delivered` sin registrar cómo se
// cobró. Estas reglas son la única puerta para declarar una orden cobrada.
//
//   · 1 a MAX_PARTS partes; cada parte con su propio posId (idempotencia).
//   · Montos en centavos enteros ≥ 1; la suma tiene que ser EXACTAMENTE el
//     total que el server recalculó para la orden (nunca el del cliente).
//   · Kripton se rechaza: no hay integración en el POS (no hay forma de
//     verificar el cobro). Se habilita cuando exista.
//
// Comisión de plataforma (platformFeeAmount) — DECISIÓN DOCUMENTADA:
//   El POS registra cobros presenciales que NO pasan por la cuenta de
//   TakeasyGO: el efectivo va al cajón, MP Point / POSNET liquidan a la cuenta
//   del comercio y la transferencia llega directo al comercio. La comisión de
//   `lib/pricing.ts` existe para cobros que SÍ intermedia la plataforma
//   (checkout MP/Kripton online, transferencia en delivery). Por eso una venta
//   POS registra fee = 0 de forma EXPLÍCITA (posPlatformFeeAmount), no por
//   omisión. Si negocio decide cobrar comisión sobre ventas POS, el cambio es
//   esta función y nada más.
// ============================================================================

export const MAX_POS_PAYMENT_PARTS = 10
const MAX_REFERENCE_LENGTH = 100

export interface PosPaymentPartInput {
  posId: string
  method: PosPayableMethod
  amount: number
  reference: string | null
}

const PAYABLE = new Set<string>(POS_PAYABLE_METHODS)

/** Valida el body y devuelve las partes tipadas. Lanza PosError.validation. */
export function parsePosPayments(body: unknown): PosPaymentPartInput[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw PosError.validation('Body debe ser un objeto')
  }
  const raw = (body as { payments?: unknown }).payments
  if (!Array.isArray(raw) || raw.length === 0) {
    throw PosError.validation('payments debe ser un arreglo con al menos un cobro')
  }
  if (raw.length > MAX_POS_PAYMENT_PARTS) {
    throw PosError.validation(`Máximo ${MAX_POS_PAYMENT_PARTS} partes por cobro`)
  }

  const seen = new Set<string>()
  return raw.map((part, i) => {
    if (typeof part !== 'object' || part === null) {
      throw PosError.validation(`payments[${i}] inválido`)
    }
    const p = part as Record<string, unknown>

    const posId = typeof p.id === 'string' ? p.id.trim() : ''
    if (!posId || posId.length > 100) throw PosError.validation(`payments[${i}].id inválido`)
    if (seen.has(posId)) throw PosError.validation(`payments[${i}].id repetido`)
    seen.add(posId)

    if (p.method === 'kripton') {
      throw PosError.validation('Kripton no está habilitado en el POS')
    }
    if (typeof p.method !== 'string' || !PAYABLE.has(p.method)) {
      throw PosError.validation(`payments[${i}].method inválido`)
    }

    if (typeof p.amount !== 'number' || !Number.isSafeInteger(p.amount) || p.amount < 1) {
      throw PosError.validation(`payments[${i}].amount debe ser un entero en centavos ≥ 1`)
    }

    let reference: string | null = null
    if (p.reference !== undefined && p.reference !== null && p.reference !== '') {
      if (typeof p.reference !== 'string' || p.reference.length > MAX_REFERENCE_LENGTH) {
        throw PosError.validation(`payments[${i}].reference inválida`)
      }
      reference = p.reference.trim() || null
    }

    return { posId, method: p.method as PosPayableMethod, amount: p.amount, reference }
  })
}

/** La suma de las partes tiene que cerrar contra el total del server. */
export function assertPaymentsCoverTotal(parts: PosPaymentPartInput[], orderTotal: number): void {
  const sum = parts.reduce((s, p) => s + p.amount, 0)
  if (sum !== orderTotal) {
    throw PosError.validation(
      'La suma de los cobros no coincide con el total de la orden',
      `sum=${sum} total=${orderTotal}`
    )
  }
}

/** `payment.method` de la orden: el método único, o 'mixed' si hay varios. */
export function summaryPaymentMethod(parts: { method: string }[]): string {
  const methods = new Set(parts.map((p) => p.method))
  return methods.size === 1 ? parts[0].method : 'mixed'
}

/** Ver bloque de decisión arriba: ventas POS no generan comisión. */
export function posPlatformFeeAmount(): number {
  return 0
}

/**
 * Huella del cobro para la idempotencia: mismo conjunto de partes
 * (independiente del orden) ⇒ mismo cobro. No incluye userId ni paidAt.
 */
export function paymentsSignature(parts: { posId: string; method: string; amount: number }[]): string {
  return JSON.stringify(
    [...parts]
      .map((p) => [p.posId, p.method, p.amount])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  )
}
