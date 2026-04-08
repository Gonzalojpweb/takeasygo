// Configuracion de planes de facturacion — safe para importar desde cliente y servidor

export type BillablePlan = 'try' | 'buy' | 'full'

export const BILLING_CONFIG: Record<BillablePlan, { label: string; amount: number; currency: string }> = {
  try:  { label: 'Plan Inicial',     amount: 65_000, currency: 'ARS' },
  buy:  { label: 'Plan Crecimiento', amount: 75_000, currency: 'ARS' },
  full: { label: 'Plan Premium',     amount: 90_000, currency: 'ARS' },
}
