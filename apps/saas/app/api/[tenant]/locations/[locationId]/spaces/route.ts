import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { spacesAdminContext, spaceErrorResponse } from '@/lib/spaces/admin-access'
import { createSpace, listSpaces, parseSpacePatch } from '@/lib/spaces/location-spaces'

// ============================================================================
// /api/[tenant]/locations/[locationId]/spaces — Salón y espacios (panel)
// ============================================================================
// GET  espacios de la sede con sus mesas y reservas por venir.
// POST { name, capacity?, reservable?, enabled? } crea uno.
// Mismo servicio que el POS (lib/spaces/location-spaces).
// ============================================================================

type Params = { params: Promise<{ tenant: string; locationId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { tenant, locationId } = await params
  const ctx = await spacesAdminContext(request, tenant, locationId)
  if (ctx instanceof NextResponse) return ctx
  try {
    return NextResponse.json(await listSpaces(ctx.tenantId, locationId))
  } catch (err) {
    return spaceErrorResponse(err)
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { tenant, locationId } = await params
  const ctx = await spacesAdminContext(request, tenant, locationId)
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    const space = await createSpace(ctx.tenantId, locationId, parseSpacePatch(body, { creating: true }))
    await logAudit({ tenantId: ctx.tenantId, action: 'location.space.create', entity: 'Location', entityId: locationId, details: { space, source: 'panel' }, request, userId: ctx.userId, userRole: ctx.role })
    return NextResponse.json({ space }, { status: 201 })
  } catch (err) {
    return spaceErrorResponse(err)
  }
}
