import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rateLimit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { claimRedemption } from '@/lib/pos-online/club'

// ============================================================================
// POST /api/[tenant]/pos/club/redemptions/[id] { code } — entregar un canje
// ============================================================================
// El cliente muestra su código; la caja lo tipea. Condicional: un premio se
// entrega una sola vez. 10 intentos de código por minuto por usuario.
// ============================================================================

export const POST = posRoute<{ tenant: string; id: string }>('orders.pay', async (ctx, { id }) => {
  const limit = await rateLimit(`pos-claim:${ctx.tenantId}:${ctx.user.id}`, 10, 60_000)
  if (!limit.success) throw PosError.rateLimited()
  const body = await readPosBody(ctx.request)
  requireFields(body, ['code'])
  if (typeof body.code !== 'string' || !body.code.trim()) throw PosError.validation('Ingresá el código del canje')
  const res = await claimRedemption(ctx, id, body.code)
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.club.redemption.claim',
    entity: 'StoreRedemption',
    entityId: id,
    details: { locationId: ctx.locationId },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ ok: true, ...res })
})
