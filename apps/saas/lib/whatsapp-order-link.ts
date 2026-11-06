// ============================================================================
// WhatsApp en el seguimiento del pedido — lo habilita el superadmin (06/11/2026)
// ============================================================================
// En la página de seguimiento, el cliente que pagó por transferencia o por
// Mercado Pago puede escribirle al local por WhatsApp (mandar el comprobante,
// avisar del pago). Ahora el superadmin lo prende o apaga POR COMERCIO y POR
// MEDIO: solo transferencia, solo Mercado Pago, ambos o ninguno, con
// cualquier plan.
//
// Sin dato guardado (comercios anteriores a este cambio) sigue como estaba:
// habilitado, para no cortarle a nadie el circuito de comprobantes de un día
// para el otro. Los comercios nuevos nacen con los dos apagados.
// No toca el flujo de pago de Mercado Pago: solo decide si se muestra el botón.
// ============================================================================

export interface WhatsappOrderLinkFeatures {
  whatsappOrderTransfer?: boolean | null
  whatsappOrderMercadoPago?: boolean | null
}

export function whatsappOrderLinkEnabled(features: WhatsappOrderLinkFeatures | null | undefined, paymentMethod: string | null | undefined): boolean {
  if (paymentMethod === 'transfer') return features?.whatsappOrderTransfer !== false
  if (paymentMethod === 'mercadopago') return features?.whatsappOrderMercadoPago !== false
  return false
}

/** Valores con los que nace un comercio nuevo: apagados hasta que el superadmin los habilite. */
export const NEW_TENANT_WHATSAPP_ORDER_LINK = { whatsappOrderTransfer: false, whatsappOrderMercadoPago: false } as const
