import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { spacesAdminContext, spaceErrorResponse } from '@/lib/spaces/admin-access'
import { deleteSpace, parseSpacePatch, updateSpace } from '@/lib/spaces/location-spaces'

// ============================================================================
// /api/[tenant]/locations/[locationId]/spaces/[spaceId] — un espacio (panel)
// ============================================================================
// PATCH { name?, capacity?, reservable?, enabled?, blockedDates?, order? }
// DELETE: solo si no tiene mesas ni reservas por venir (si no, deshabilitar).
// ============================================================================

type Params = { params: Promise<{ tenant: string; locationId: string; spaceId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { tenant, locationId, spaceId } = await params
  const ctx = await spacesAdminContext(request, tenant, locationId)
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    const { before, after } = await updateSpace(ctx.tenantId, locationId, spaceId, parseSpacePatch(body, { creating: false }))
    await logAudit({ tenantId: ctx.tenantId, action: 'location.space.update', entity: 'Location', entityId: locationId, details: { spaceId, before, after, source: 'panel' }, request, userId: ctx.userId, userRole: ctx.role })
    return NextResponse.json({ space: after })
  } catch (err) {
    return spaceErrorResponse(err)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { tenant, locationId, spaceId } = await params
  const ctx = await spacesAdminContext(request, tenant, locationId)
  if (ctx instanceof NextResponse) return ctx
  try {
    const removed = await deleteSpace(ctx.tenantId, locationId, spaceId)
    await logAudit({ tenantId: ctx.tenantId, action: 'location.space.delete', entity: 'Location', entityId: locationId, details: { space: removed, source: 'panel' }, request, userId: ctx.userId, userRole: ctx.role })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return spaceErrorResponse(err)
  }
}
