import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { logAudit } from '@/lib/audit'
import { createSpace, listSpaces, parseSpacePatch } from '@/lib/spaces/location-spaces'
import { reservationsAvailable, toPosSpaceError } from '@/lib/spaces/pos-access'

// ============================================================================
// /api/[tenant]/pos/sectors — espacios del salón (obs. 24/10; 14/11/2026)
// ============================================================================
// GET  (tables.read): los espacios de la sede (Location.spaces), con mesas,
//      reservas por venir y si la sede está recibiendo reservas.
// POST (config.manage = admin y encargado): crea un espacio. Desde el
//      14/11/2026 el POS también los crea y edita: un local sin reservas
//      necesita dividir el salón, y en un finde lleno no hay que salir del
//      POS para pausar las reservas de un espacio.
// Mismo servicio que el panel (lib/spaces/location-spaces).
// ============================================================================

export const GET = posRoute('tables.read', async (ctx) => {
  try {
    const [{ spaces, reservationsEnabled }, available] = await Promise.all([listSpaces(ctx.tenantId, ctx.locationId), reservationsAvailable(ctx.tenantId)])
    return NextResponse.json({
      // Compatibilidad: `sectors` con la forma de siempre (+ campos nuevos).
      sectors: spaces.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, enabled: s.enabled, order: s.order, reservable: s.reservable, tables: s.tables, upcomingReservations: s.upcomingReservations, blockedDates: s.blockedDates })),
      reservations: { available, enabled: available && reservationsEnabled },
    })
  } catch (err) {
    toPosSpaceError(err)
  }
})

export const POST = posRoute('config.manage', async (ctx) => {
  try {
    const body = await readPosBody(ctx.request)
    const space = await createSpace(ctx.tenantId, ctx.locationId, parseSpacePatch(body, { creating: true }))
    await logAudit({ tenantId: ctx.tenantId, action: 'location.space.create', entity: 'Location', entityId: ctx.locationId, details: { space, source: 'pos' }, request: ctx.request, userId: ctx.user.id, userRole: ctx.user.role })
    return NextResponse.json({ sector: space }, { status: 201 })
  } catch (err) {
    toPosSpaceError(err)
  }
})
