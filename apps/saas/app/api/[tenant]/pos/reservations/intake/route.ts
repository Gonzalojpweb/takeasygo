import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { logAudit } from '@/lib/audit'
import { setReservationIntake } from '@/lib/spaces/location-spaces'
import { reservationsAvailable, toPosSpaceError } from '@/lib/spaces/pos-access'

// ============================================================================
// PUT /api/[tenant]/pos/reservations/intake { enabled } — abrir / cerrar la
// recepción de reservas de la sede desde el POS (14/11/2026)
// ============================================================================
// Un finde lleno: el encargado corta las reservas online sin salir del POS.
// Las reservas ya hechas no se tocan. config.manage = admin y encargado.
// Mismo campo que Configuración › Reservas del panel (reservationConfig.enabled).
// ============================================================================

export const PUT = posRoute('config.manage', async (ctx) => {
  const body = await readPosBody(ctx.request)
  if (typeof body.enabled !== 'boolean') throw PosError.validation('enabled tiene que ser verdadero o falso')
  if (!(await reservationsAvailable(ctx.tenantId))) {
    throw PosError.forbidden('Este comercio no tiene el módulo de reservas activo')
  }
  try {
    const enabled = await setReservationIntake(ctx.tenantId, ctx.locationId, body.enabled)
    await logAudit({ tenantId: ctx.tenantId, action: 'location.reservations.intake', entity: 'Location', entityId: ctx.locationId, details: { enabled, source: 'pos' }, request: ctx.request, userId: ctx.user.id, userRole: ctx.user.role })
    return NextResponse.json({ enabled })
  } catch (err) {
    toPosSpaceError(err)
  }
})
