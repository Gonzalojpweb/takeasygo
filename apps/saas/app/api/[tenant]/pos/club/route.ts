import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { clubLookup } from '@/lib/pos-online/club'

// ============================================================================
// GET /api/[tenant]/pos/club?phone=… — socio del club por celular (Fase 4)
// ============================================================================
// Caja, encargado y admin. Devuelve nombre, puntos, nivel y canjes
// pendientes de la sede; nunca el código del canje ni el celular.
// 60 consultas por minuto por usuario (frena barridos de números).
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  const limit = await rateLimit(`pos-club:${ctx.tenantId}:${ctx.user.id}`, 60, 60_000)
  if (!limit.success) throw PosError.rateLimited()
  const phone = new URL(ctx.request.url).searchParams.get('phone') ?? ''
  return NextResponse.json(await clubLookup(ctx, phone))
})
