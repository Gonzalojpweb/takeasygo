import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { issuePosPin } from '@/lib/pos-online/pinIssue'
import { findTeamMember, toTeamMember } from '@/lib/pos-online/team'

// ============================================================================
// POST /api/[tenant]/pos/team/[id]/pin — PIN nuevo para alguien del equipo
// (lo olvidó o lo compartió). Lo genera el server y sale UNA vez; el PIN
// anterior deja de servir en el acto.
// ============================================================================

export const POST = posRoute<{ tenant: string; id: string }>('config.manage', async (ctx, { id }) => {
  const member = await findTeamMember(ctx, id)
  if (!member) throw PosError.notFound('Persona no encontrada en esta sede')
  const view = toTeamMember(member, ctx)
  if (!view.canManage) throw PosError.forbidden(view.isMe ? 'Tu PIN se cambia desde «Mi perfil»' : 'Tu rol no puede cambiar el PIN de esta persona')
  if (!member.isActive) throw PosError.conflict('La persona está desactivada')

  const issued = await issuePosPin(ctx.tenantId, member._id)
  if (!issued.ok) throw PosError.internal(issued.reason === 'no_pepper' ? 'PIN de POS no configurado en el servidor' : 'No se pudo generar un PIN único, reintentá')

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.team.pin_reset',
    entity: 'User',
    entityId: id,
    details: { targetRole: member.role },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ pin: issued.pin, posPinUpdatedAt: issued.updatedAt.toISOString() }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
})
