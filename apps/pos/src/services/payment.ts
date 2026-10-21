import type { PaymentMethod } from "@takeasygo/types"

// ============================================================================
// Métodos de pago del POS
// ============================================================================
// Cobro presencial: el POS no procesa la tarjeta ni el QR, registra el cobro
// que el cajero hizo en el terminal (MP Point, POSNET) o la transferencia que
// recibió. El server (POST /pos/orders/[id]/payments) guarda el desglose en la
// orden y la caja guarda un movimiento por método.
//
// Kripton queda deshabilitado: no hay integración que permita verificar el
// cobro desde el POS (el server también lo rechaza). Se habilita cuando
// exista la integración — sacarlo de DISABLED_METHODS y del rechazo en
// apps/saas/lib/pos-online/paymentPolicy.ts.
//
// (Se eliminó createMercadoPagoPreference: no tenía ningún llamador y apuntaba
// a un endpoint del Sync Layer que el POS online no usa.)
// ============================================================================

const DISABLED_METHODS: readonly PaymentMethod[] = ["kripton"]

export function isPaymentMethodAvailable(method: PaymentMethod): boolean {
  return !DISABLED_METHODS.includes(method)
}

/** ¿El método se cobra en un terminal/canal externo (requiere confirmación)? */
export function isExternalPaymentMethod(method: PaymentMethod): boolean {
  return method !== "cash"
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
