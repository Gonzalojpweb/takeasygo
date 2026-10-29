import { NextResponse } from 'next/server'
import User from '@/models/User'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { findTeamMember, toTeamMember } from '@/lib/pos-online/team'

// ============================================================================
// PATCH /api/[tenant]/pos/team/[id] { name?, isActive? } — editar o
// desactivar a alguien del equipo de la sede. Mismas reglas que el alta:
// el encargado solo sobre cajeros y mozos; nadie sobre sí mismo.
// ============================================================================

export const PATCH = posRoute<{ tenant: string; id: string }>('config.manage', async (ctx, { id }) => {
  const member = await findTeamMember(ctx, id)
  if (!member) throw PosError.notFound('Persona no encontrada en esta sede')
  const view = toTeamMember(member, ctx)
  if (!view.canManage) throw PosError.forbidden(view.isMe ? 'No podés modificarte a vos mismo desde acá' : 'Tu rol no puede modificar a esta persona')

  const body = await readPosBody(ctx.request)
  const $set: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length < 2 || name.length > 60) throw PosError.validation('Nombre de 2 a 60 caracteres')
    $set.name = name
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw PosError.validation('isActive debe ser booleano')
    $set.isActive = body.isActive
  }
  if (Object.keys($set).length === 0) throw PosError.validation('Nada para actualizar')

  await User.updateOne({ _id: member._id, tenantId: ctx.tenantId }, { $set })
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.team.update',
    entity: 'User',
    entityId: id,
    details: $set,
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ member: toTeamMember({ ...member, ...$set } as typeof member, ctx) })
})
