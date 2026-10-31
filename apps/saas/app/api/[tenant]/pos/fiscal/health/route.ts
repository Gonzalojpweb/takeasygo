import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { computeFiscalHealth } from '@/lib/fiscal/health'
import { kickFiscalRecovery } from '@/lib/fiscal/issue'
import { runAfterResponse } from '@/lib/after-response'

// GET /api/[tenant]/pos/fiscal/health — orden de ejecución 31/10 (P1.3/P7.3):
// alertas fiscales de la sede (pendientes demorados, en revisión, ventas
// cobradas sin comprobante, credenciales, certificado, CAEA, tickets sin
// impresión confirmada). El POS lo consulta periódicamente mientras está
// abierto, y eso también dispara la recuperación del comercio (cada 2 min).
export const GET = posRoute('orders.pay', async (ctx) => {
  const health = await computeFiscalHealth(ctx.tenantId, { locationId: ctx.locationId })
  if (health.enabled) {
    runAfterResponse('fiscal: recuperación desde el POS', () => kickFiscalRecovery(ctx.tenantId))
  }
  return NextResponse.json(health)
})
