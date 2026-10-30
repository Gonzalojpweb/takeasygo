import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import User from '@/models/User'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { issuePosPin } from '@/lib/pos-online/pinIssue'
import { CREATABLE_ROLES, canManage, listTeam, technicalEmail, toTeamMember, type CreatableRole, type TeamUserDoc } from '@/lib/pos-online/team'

// ============================================================================
// GET  /api/[tenant]/pos/team — equipo de la sede (admin y encargado)
// POST /api/[tenant]/pos/team { name, role: 'waiter'|'cashier'|'manager' }
//      — alta con PIN (el PIN se devuelve UNA vez, no se guarda en claro)
// ============================================================================
// El encargado da de alta mozos y cajeros; el admin también encargados.
// La persona queda asignada a esta sede.
// ============================================================================

export const GET = posRoute('config.manage', async (ctx) => {
  return NextResponse.json({ team: await listTeam(ctx) })
})

export const POST = posRoute('config.manage', async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['name', 'role'])
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 60) throw PosError.validation('Nombre de 2 a 60 caracteres')
  if (!CREATABLE_ROLES.includes(body.role as CreatableRole)) throw PosError.validation('Rol inválido: mozo, cajero o encargado')
  const role = body.role as CreatableRole
  if (!canManage(ctx.user.role, role)) throw PosError.forbidden('Tu rol no puede dar de alta ese puesto')

  const created = new User({
    name,
    email: technicalEmail(ctx.tenantSlug),
    role,
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    assignedLocations: [new mongoose.Types.ObjectId(ctx.locationId)],
    isActive: true,
  })
  // Sin teléfono: el campo NO se guarda (el modelo pone `phone: null` por
  // defecto y el índice único sparse de phone no admite dos null).
  created.set('phone', undefined)
  await created.save()

  const issued = await issuePosPin(ctx.tenantId, created._id)
  if (!issued.ok) {
    // Sin PIN el alta no sirve para el POS: se deshace.
    await User.deleteOne({ _id: created._id, tenantId: ctx.tenantId })
    throw PosError.internal(issued.reason === 'no_pepper' ? 'PIN de POS no configurado en el servidor' : 'No se pudo generar un PIN único, reintentá')
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.team.create',
    entity: 'User',
    entityId: String(created._id),
    details: { role, locationId: ctx.locationId },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  const doc: TeamUserDoc = { _id: created._id, name, email: created.email, role, isActive: true, assignedLocations: created.assignedLocations, posPinUpdatedAt: issued.updatedAt }
  return NextResponse.json({ member: toTeamMember(doc, ctx), pin: issued.pin }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
})
