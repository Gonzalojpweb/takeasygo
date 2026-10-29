import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User from '@/models/User'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rateLimit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { issuePosPin } from '@/lib/pos-online/pinIssue'

// ============================================================================
// POST /api/[tenant]/pos/me/pin { currentPin? } — cambiar MI PIN (Fase 3)
// ============================================================================
// Si ya tengo PIN, tengo que ingresar el actual (5 intentos cada 15 min).
// Si no tengo (entré con email), se genera directo. El PIN nuevo lo genera
// el server y sale UNA vez; el anterior deja de servir.
// ============================================================================

export const POST = posRoute('catalog.read', async (ctx) => {
  if (!mongoose.isValidObjectId(ctx.user.id)) throw PosError.forbidden('Este usuario no tiene PIN de POS')
  const user = await User.findOne({ _id: ctx.user.id, tenantId: ctx.tenantId, isActive: true })
    .select('+pin role')
    .lean<{ _id: mongoose.Types.ObjectId; pin?: string | null; role: string }>()
  if (!user) throw PosError.notFound('Usuario no encontrado')

  if (user.pin) {
    const limit = await rateLimit(`pos-me-pin:${ctx.tenantId}:${ctx.user.id}`, 5, 15 * 60_000)
    if (!limit.success) throw PosError.rateLimited()
    const body = await readPosBody(ctx.request)
    const current = typeof body.currentPin === 'string' ? body.currentPin : ''
    if (!/^\d{4,8}$/.test(current) || !(await bcrypt.compare(current, user.pin))) {
      throw PosError.validation('El PIN actual no es correcto')
    }
  }

  const issued = await issuePosPin(ctx.tenantId, user._id)
  if (!issued.ok) throw PosError.internal(issued.reason === 'no_pepper' ? 'PIN de POS no configurado en el servidor' : 'No se pudo generar un PIN único, reintentá')

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.me.pin_change',
    entity: 'User',
    entityId: ctx.user.id,
    details: {},
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ pin: issued.pin, posPinUpdatedAt: issued.updatedAt.toISOString() }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
})
