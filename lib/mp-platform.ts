// lib/mp-platform.ts — Cliente MP de la plataforma (para facturación SaaS)
// Usa MP_PLATFORM_ACCESS_TOKEN del entorno, NO las credenciales del tenant.
// IMPORTANTE: getPlatformMPClient() es server-only (usa MercadoPagoConfig).
// BILLING_CONFIG puede importarse desde cliente también.

export type BillablePlan = 'try' | 'buy' | 'full'

export const BILLING_CONFIG: Record<BillablePlan, { label: string; amount: number; currency: string }> = {
  try:  { label: 'Plan Inicial',     amount: 30_000, currency: 'ARS' },
  buy:  { label: 'Plan Crecimiento', amount: 50_000, currency: 'ARS' },
  full: { label: 'Plan Premium',     amount: 80_000, currency: 'ARS' },
}

// Server-only: instancia el cliente de MP de la plataforma
export function getPlatformMPClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MercadoPagoConfig, PreApproval } = require('mercadopago')
  const accessToken = process.env.MP_PLATFORM_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_PLATFORM_ACCESS_TOKEN no configurado')
  const client = new MercadoPagoConfig({ accessToken })
  return { client, preApproval: new PreApproval(client) }
}
