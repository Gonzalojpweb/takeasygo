import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { logAudit } from '@/lib/audit'
import { deleteSpace, parseSpacePatch, updateSpace } from '@/lib/spaces/location-spaces'
import { toPosSpaceError } from '@/lib/spaces/pos-access'

// ============================================================================
// /api/[tenant]/pos/sectors/[id] — editar / borrar un espacio desde el POS
// ============================================================================
// PATCH { name?, capacity?, reservable?, enabled?, blockedDates?, order? }
// DELETE: solo sin mesas ni reservas por venir (si no, deshabilitarlo).
// config.manage = administrador y encargado.
// ============================================================================

export const PATCH = posRoute<{ tenant: string; id: string }>('config.manage', async (ctx, { id }) => {
  try {
    const body = await readPosBody(ctx.request)
    const { before, after } = await updateSpace(ctx.tenantId, ctx.locationId, id, parseSpacePatch(body, { creating: false }))
    await logAudit({ tenantId: ctx.tenantId, action: 'location.space.update', entity: 'Location', entityId: ctx.locationId, details: { spaceId: id, before, after, source: 'pos' }, request: ctx.request, userId: ctx.user.id, userRole: ctx.user.role })
    return NextResponse.json({ sector: after })
  } catch (err) {
    toPosSpaceError(err)
  }
})

export const DELETE = posRoute<{ tenant: string; id: string }>('config.manage', async (ctx, { id }) => {
  try {
    const removed = await deleteSpace(ctx.tenantId, ctx.locationId, id)
    await logAudit({ tenantId: ctx.tenantId, action: 'location.space.delete', entity: 'Location', entityId: ctx.locationId, details: { space: removed, source: 'pos' }, request: ctx.request, userId: ctx.user.id, userRole: ctx.user.role })
    return NextResponse.json({ ok: true })
  } catch (err) {
    toPosSpaceError(err)
  }
})
