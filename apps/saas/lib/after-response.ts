// ============================================================================
// runAfterResponse — trabajo que tiene que terminar aunque ya se respondió
// ============================================================================
// En serverless (Vercel) una promesa suelta puede cortarse cuando la función
// responde: `onOrderConfirmed(order).catch(() => {})` dejaba pedidos web/MP
// sin comanda impresa ni consumo de inventario hasta el cron del día
// siguiente. after() de next/server mantiene viva la función hasta terminar
// SIN demorar la respuesta. Fuera de un scope de request (tests, scripts)
// after() lanza → se corre igual, sin esperar.
// ============================================================================

import { after } from 'next/server'

export function runAfterResponse(label: string, fn: () => Promise<unknown>): void {
  const run = () =>
    fn().then(
      () => undefined,
      (err) => console.error(`[after-response] ${label} falló:`, err),
    )
  try {
    after(run)
  } catch {
    void run()
  }
}
