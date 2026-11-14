import { DISCOUNT_NOTE_MAX, DISCOUNT_REASONS, isDiscountReason, type DiscountReason } from '@takeasygo/business'
import { PosError } from './errors'
import type { SaasOrderItemDraft } from './orderMapper'

// ============================================================================
// Descuentos del POS (Fase D, 2026-10)
// ============================================================================
// Modelo: el descuento vive EN CADA LÍNEA y baja su `subtotal`. Así todo lo
// que ya lee subtotales (total de la orden, cobro, factura ARCA con su IVA
// por alícuota, Libro IVA, Z) refleja el descuento sin lógica nueva.
//   · por ítem       → solo esa línea.
//   · por cuenta     → todas las líneas abiertas: % igual en cada una;
//                      un MONTO se reparte proporcional al importe de cada
//                      línea (resto mayor, al centavo: la suma es exacta).
// Una línea tiene a lo sumo UN descuento (el nuevo reemplaza al anterior).
// Los montos son centavos enteros; nunca se descuenta más que la línea.
// ============================================================================

// Motivos: fuente única en @takeasygo/business/discount-policy (server, POS
// y modo sin internet leen la misma lista). Se re-exportan para no romper
// los imports existentes.
export { DISCOUNT_REASONS, type DiscountReason }
export type DiscountKind = 'percent' | 'amount'

export interface PosLineDiscount {
  kind: DiscountKind
  /** Porcentaje (1–100) o monto en centavos que se pidió. */
  value: number
  /** Centavos efectivamente descontados de la línea. */
  amountCents: number
  scope: 'item' | 'order'
  reason: DiscountReason
  note: string | null
  by: string
  approvedBy: string | null
  at: Date
}

/** Línea de orden con su descuento (el tipo vive en orderMapper). */
export type DiscountedItem = SaasOrderItemDraft
type StoredDiscount = NonNullable<SaasOrderItemDraft['posDiscount']>

export interface DiscountInput {
  kind: DiscountKind
  value: number
  reason: DiscountReason
  note: string | null
  /**
   * Modo «importe final» (14/11/2026): lo que el cajero escribió que quería
   * cobrar. Solo para la auditoría: el descuento que se aplica es `value`
   * (monto fijo = base − final, calculado en el POS). El server verifica que
   * coincidan con el importe real de la cuenta.
   */
  finalCents: number | null
}

const MAX_NOTE = DISCOUNT_NOTE_MAX

/** Valida el body de un descuento (400 ante cualquier cosa rara). */
export function parseDiscountInput(body: Record<string, unknown>): DiscountInput {
  const kind = body.kind
  if (kind !== 'percent' && kind !== 'amount') throw PosError.validation('kind debe ser percent o amount')
  const value = body.value
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw PosError.validation('value debe ser un entero positivo (porcentaje o centavos)')
  }
  if (kind === 'percent' && value > 100) throw PosError.validation('El porcentaje va de 1 a 100')
  const reason = body.reason
  if (!isDiscountReason(reason)) {
    throw PosError.validation(`Motivo requerido: ${Object.keys(DISCOUNT_REASONS).join(', ')}`)
  }
  const note = body.note
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_NOTE)) {
    throw PosError.validation(`La nota del descuento es texto de hasta ${MAX_NOTE} caracteres`)
  }
  if (reason === 'other' && (typeof note !== 'string' || !note.trim())) {
    throw PosError.validation('Con motivo «Otro» la nota es obligatoria')
  }
  const final = body.finalCents
  if (final !== undefined && final !== null) {
    if (typeof final !== 'number' || !Number.isInteger(final) || final < 0) {
      throw PosError.validation('finalCents debe ser un entero >= 0 (centavos)')
    }
    if (kind !== 'amount') throw PosError.validation('El importe final se aplica como monto fijo')
  }
  return {
    kind,
    value,
    reason,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
    finalCents: typeof final === 'number' ? final : null,
  }
}

/** Importe de la línea sin descuento (base + extras) × cantidad. */
export function grossOf(item: Pick<SaasOrderItemDraft, 'basePrice' | 'extraPrice' | 'quantity'>): number {
  return (item.basePrice + item.extraPrice) * item.quantity
}

/** Centavos a descontar de una línea de importe `gross`. */
export function lineDiscountCents(gross: number, kind: DiscountKind, value: number): number {
  if (gross <= 0) return 0
  return kind === 'percent' ? Math.min(gross, Math.round((gross * value) / 100)) : Math.min(gross, value)
}

/**
 * Reparte `amount` centavos entre importes `weights` en proporción, al
 * centavo, con resto mayor: la suma da exactamente min(amount, Σweights).
 */
export function distributeCents(weights: number[], amount: number): number[] {
  const total = weights.reduce((s, w) => s + w, 0)
  if (total <= 0) return weights.map(() => 0)
  const target = Math.min(amount, total)
  const raw = weights.map((w) => (w * target) / total)
  const out = raw.map(Math.floor)
  let rest = target - out.reduce((s, n) => s + n, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (rest <= 0) break
    if (out[i] < weights[i]) { out[i] += 1; rest -= 1 }
  }
  return out
}

function withDiscount(item: DiscountedItem, discount: StoredDiscount | null): DiscountedItem {
  const gross = grossOf(item)
  const cents = discount ? Math.min(gross, discount.amountCents) : 0
  return { ...item, posDiscount: discount ? { ...discount, amountCents: cents } : null, subtotal: gross - cents }
}

/**
 * Aplica un descuento. `lineId` = solo esa línea; sin lineId = toda la
 * cuenta (cada línea recibe su parte). Devuelve las líneas nuevas y el
 * total descontado.
 */
export function applyDiscount(
  items: DiscountedItem[],
  input: DiscountInput,
  meta: { lineId: string | null; by: string; approvedBy: string | null; at: Date }
): { items: DiscountedItem[]; discountedCents: number } {
  const base = { kind: input.kind, value: input.value, reason: input.reason, note: input.note, by: meta.by, approvedBy: meta.approvedBy, at: meta.at }

  if (meta.lineId) {
    let found = false
    let discounted = 0
    const next = items.map((item) => {
      if (String(item._id) !== meta.lineId) return item
      found = true
      const amountCents = lineDiscountCents(grossOf(item), input.kind, input.value)
      discounted = amountCents
      return withDiscount(item, { ...base, scope: 'item', amountCents })
    })
    if (!found) throw PosError.notFound('Producto no encontrado en la orden')
    return { items: next, discountedCents: discounted }
  }

  const grosses = items.map(grossOf)
  const shares =
    input.kind === 'percent'
      ? grosses.map((g) => lineDiscountCents(g, 'percent', input.value))
      : distributeCents(grosses, input.value)
  const next = items.map((item, i) => (grosses[i] > 0 ? withDiscount(item, { ...base, scope: 'order', amountCents: shares[i] }) : item))
  return { items: next, discountedCents: shares.reduce((s, n) => s + n, 0) }
}

/** Quita el descuento de una línea (lineId) o de todas. */
export function removeDiscount(items: DiscountedItem[], lineId: string | null): DiscountedItem[] {
  return items.map((item) => (lineId && String(item._id) !== lineId ? item : withDiscount(item, null)))
}

/**
 * Nueva cantidad en una línea con descuento: el % se recalcula sobre el
 * importe nuevo; un monto fijo se mantiene, sin superar la línea.
 */
export function withQuantityKeepingDiscount(item: DiscountedItem, quantity: number): DiscountedItem {
  const resized = { ...item, quantity }
  const d = item.posDiscount
  if (!d) return { ...resized, subtotal: grossOf(resized) }
  const gross = grossOf(resized)
  const amountCents = d.kind === 'percent' ? lineDiscountCents(gross, 'percent', d.value) : Math.min(gross, d.amountCents)
  return withDiscount(resized, { ...d, amountCents })
}
