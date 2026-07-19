import type { PaymentMethod } from "@takeasygo/types"

const SYNC_URL = import.meta.env.VITE_SYNC_URL;

export interface CreatePreferenceRequest {
  orderId: string
  amount: number
  description: string
  tenantId: string
}

export interface CreatePreferenceResponse {
  preferenceId: string
  initPoint: string
  sandboxInitPoint: string
}

export async function createMercadoPagoPreference(
  data: CreatePreferenceRequest,
  jwt: string
): Promise<CreatePreferenceResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/payments/create-preference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Payment preference failed (${res.status})`)
  }

  return res.json()
}

export function isPaymentMethodAvailable(method: PaymentMethod): boolean {
  // Todos disponibles en v1 — kripton se habilita cuando la integración esté lista
  const disabled: PaymentMethod[] = []
  return !disabled.includes(method)
}

export function formatPaymentMethod(method: PaymentMethod): {
  name: string
  icon: string
  description: string
} {
  switch (method) {
    case "cash":
      return { name: "Efectivo", icon: "💵", description: "Efectivo" }
    case "mercadopago":
      return { name: "MercadoPago", icon: "💳", description: "MP Point / QR" }
    case "posnet_debit":
      return { name: "POSNET Débito", icon: "💳", description: "Tarjeta de débito" }
    case "posnet_credit":
      return { name: "POSNET Crédito", icon: "💳", description: "Tarjeta de crédito" }
    case "kripton":
      return { name: "Kripton", icon: "🪙", description: "Criptomoneda" }
    case "transfer":
      return { name: "Transferencia", icon: "🏦", description: "Transferencia bancaria" }
    default:
      return { name: "Otro", icon: "💳", description: "" }
  }
}

/**
 * Resuelve el tipo de pago para el POS interno.
 * cash → efectivo directo, todo lo demás → terminal/cobro externo.
 */
export function resolvePaymentMethod(method: PaymentMethod): "cash" | "terminal" {
  switch (method) {
    case "cash":
      return "cash"
    default:
      return "terminal"
  }
}
