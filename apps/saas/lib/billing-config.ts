// Configuracion de planes de facturacion — safe para importar desde cliente y servidor
// PRECIO REAL COBRADO: este monto es lo que se pasa a MercadoPago como
// `transaction_amount` en app/api/[tenant]/billing/subscribe/route.ts:63.
// Debe coincidir con components/landing/Pricing.tsx y con PLAN_PRICE de
// packages/business/src/plans.ts (fuente de verdad del producto).

export type BillablePlan = 'try' | 'buy' | 'full'

export const BILLING_CONFIG: Record<BillablePlan, { label: string; amount: number; currency: string }> = {
  try:  { label: 'Plan Inicial',     amount: 35_000, currency: 'ARS' },
  buy:  { label: 'Plan Crecimiento', amount: 45_000, currency: 'ARS' },
  full: { label: 'Plan Premium',     amount: 60_000, currency: 'ARS' },
}
