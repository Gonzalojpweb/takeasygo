import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { recordHeartbeat } from '@/lib/connectivity'

// ============================================================================
// POST /api/[tenant]/pos/heartbeat — el POS avisa que está conectado (28/11/2026)
// ============================================================================
// Señal para la pausa automática sin conexión (lib/connectivity). Solo la
// sede del POS. Sin cuerpo; responde 204.
// ============================================================================

export const POST = posRoute('orders.read', async (ctx) => {
  if (ctx.offline) return new NextResponse(null, { status: 204 })
  await recordHeartbeat(ctx.tenantId, [ctx.locationId], 'pos')
  return new NextResponse(null, { status: 204 })
})
