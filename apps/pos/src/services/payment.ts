import type { PaymentMethod } from "@takeasygo/types"

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "http://localhost:3001"

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
      return { name: "Efectivo", icon: "💵", description: "Pago en efectivo" }
    case "posnet":
      return { name: "POSNET", icon: "💳", description: "Tarjeta débito/crédito" }
    case "mercadopago":
      return { name: "MercadoPago", icon: "📱", description: "QR MercadoPago" }
  }
}
