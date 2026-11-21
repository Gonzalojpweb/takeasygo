// ============================================================================
// Textos y colores del cobro de un pedido — tablero del superadmin (20/11/2026)
// ============================================================================

export type PaymentState = 'paid' | 'cash' | 'awaiting' | 'transfer_pending'

export const METHOD_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  mercadopago: { label: 'MercadoPago', emoji: '💳', color: '#3483FA' },
  transfer: { label: 'Transferencia', emoji: '🏦', color: '#8B5CF6' },
  cash: { label: 'Efectivo', emoji: '💵', color: '#F59E0B' },
  kripton: { label: 'Kripton', emoji: '🪙', color: '#00D089' },
  unknown: { label: 'Sin medio', emoji: '❔', color: '#9CA3AF' },
}

export function methodInfo(method: string | null | undefined) {
  return METHOD_INFO[method ?? 'unknown'] ?? METHOD_INFO.unknown
}

export const PAYMENT_STATE_INFO: Record<PaymentState, { label: string; className: string }> = {
  paid: { label: 'Pagado', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  cash: { label: 'Cobra al entregar', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  awaiting: { label: 'Esperando pago', className: 'bg-red-500/10 text-red-700 border-red-500/30' },
  transfer_pending: { label: 'Transferencia sin confirmar', className: 'bg-violet-500/10 text-violet-700 border-violet-500/30' },
}

export const ORDER_MODE_LABEL: Record<string, string> = {
  delivery: '🛵 Delivery',
  takeaway: '🥡 Retiro',
  'dine-in': '🍽️ Salón',
  business: '🏢 Empresa',
}

export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
