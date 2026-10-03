'use client'

import type { CartItem } from '@/types/cart'

/**
 * Rearma el checkout desde un pedido cancelado y lleva al cliente directo al
 * paso de pago.
 *
 * ── POR QUÉ ESCRIBE CLAVES ADICIONALES ───────────────────────────────────────
 * El carrito ya usa `cart_${tenantSlug}` y el `CheckoutContext` lo lee solo.
 * Además escribimos `checkoutForm_*` y `checkoutStep_*`, que el contexto aplica
 * una única vez al montar. Son claves nuevas: si este helper no corre, el
 * checkout se comporta exactamente como antes.
 *
 * ── POR QUÉ delivery NO ABRE EN EL PASO DE PAGO ──────────────────────────────
 * El costo de delivery se cotiza por geocodificación en vivo. Restaurar una
 * dirección vieja sin volver a cotizar mostraría un total que el backend puede
 * rechazar. Para delivery se restaura el carrito y se entra al primer paso: lo
 * caro de recuperar (los ítems con sus customizaciones) se recupera igual.
 */

export const CART_KEY = (tenantSlug: string) => `cart_${tenantSlug}`
export const FORM_KEY = (tenantSlug: string) => `checkoutForm_${tenantSlug}`
export const STEP_KEY = (tenantSlug: string) => `checkoutStep_${tenantSlug}`

export interface CartRestorePayload {
  orderNumber: string
  orderMode: string
  locationId: string | null
  cartItems: CartItem[]
  customer: { name: string; phone: string; email: string }
  notes: string
  empty: boolean
}

export function checkoutPathFor(orderMode: string): string {
  if (orderMode === 'delivery') return `delivery/checkout`
  if (orderMode === 'business') return `business/checkout`
  // 'dine-in' no tiene checkout propio en la app: se resuelve por takeaway.
  return `takeaway/checkout`
}

/**
 * Pide el carrito reconstruido, lo deja listo en sessionStorage y devuelve la
 * URL del checkout. No navega: deja que el caller decida (sirve igual para
 * `router.push` y para tests).
 */
export async function prepareCheckoutRestore(args: {
  tenantSlug: string
  orderId: string
  trackingToken: string | null
}): Promise<{ url: string; payload: CartRestorePayload } | null> {
  const { tenantSlug, orderId, trackingToken } = args
  if (!trackingToken) return null

  const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/cart-restore`, {
    headers: { 'x-tracking-token': trackingToken },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || 'No se pudo recuperar tu pedido')
  }

  const payload: CartRestorePayload = await res.json()
  if (payload.empty || !payload.locationId) return null

  // El checkout exige `customer.name`: sin nombre el backend rechaza el pedido.
  // Si el original no lo tenía, no se avanza al paso de pago.
  const canOpenPaymentStep = !!payload.customer?.name && payload.orderMode !== 'delivery'

  sessionStorage.setItem(CART_KEY(tenantSlug), JSON.stringify(payload.cartItems))
  sessionStorage.setItem(
    FORM_KEY(tenantSlug),
    JSON.stringify({
      name: payload.customer?.name || '',
      phone: payload.customer?.phone || '',
      email: payload.customer?.email || '',
      notes: payload.notes || '',
    })
  )
  sessionStorage.setItem(STEP_KEY(tenantSlug), canOpenPaymentStep ? 'pay' : 'cart')

  const url = `/${tenantSlug}/menu/${payload.locationId}/${checkoutPathFor(
    payload.orderMode
  )}${canOpenPaymentStep ? '?step=pay' : ''}`

  return { url, payload }
}