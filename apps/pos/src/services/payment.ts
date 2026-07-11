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
  const disabled: PaymentMethod[] = ["usdt", "pix"]
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
    case "debit":
      return { name: "Débito", icon: "💳", description: "Tarjeta de débito" }
    case "credit":
      return { name: "Crédito", icon: "💳", description: "Tarjeta de crédito" }
    case "pix":
      return { name: "PIX", icon: "📱", description: "Pago digital" }
    case "usdt":
      return { name: "USDT", icon: "₮", description: "Cripto (próximamente)" }
    case "mixed":
      return { name: "Pago Mixto", icon: "⚖", description: "Dividir cuenta" }
    default:
      return { name: "Otro", icon: "💳", description: "" }
  }
}

export function resolvePaymentMethod(method: PaymentMethod): "cash" | "posnet" | "mercadopago" {
  switch (method) {
    case "cash":
      return "cash"
    case "debit":
    case "credit":
    case "mixed":
      return "posnet"
    case "pix":
      return "mercadopago"
    default:
      return "posnet"
  }
}
