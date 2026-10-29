import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { issuePosPin } from '@/lib/pos-online/pinIssue'

// ============================================================================
// POST   /api/[tenant]/users/[userId]/pos-pin — genera (o regenera) el PIN
// DELETE /api/[tenant]/users/[userId]/pos-pin — quita el PIN
// ============================================================================
// El PIN lo GENERA el server (6 dígitos, no trivial, único en el tenant) y se
// devuelve UNA sola vez. Nadie lo elige a propósito: si el admin pudiera
// elegirlo, el "ese PIN ya está en uso" sería un oráculo para descubrir el PIN
// de otra persona (p. ej. un manager averiguando el del admin).
//
// Guardado y generación: lib/pos-online/pinIssue (compartido con el POS).
// Roles con POS: caja (admin, manager, operations_manager, cashier →
// terminal hub) y mozos (staff, waiter, host → celular, POS mobile).
// ============================================================================

const POS_PIN_ROLES = new Set(['admin', 'manager', 'operations_manager', 'cashier', 'staff', 'waiter', 'host'])

type Params = { params: Promise<{ tenant: string; userId: string }> }

async function resolveTarget(request: NextRequest, params: Params['params']) {
  const { tenant: tenantSlug, userId } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }

  const authError = await requireAuth(request, tenant._id.toString())
  if (authError) return { error: authError }

  const permError = await enforcePermissionForRequest(request, {
    tenant,
    tenantId: tenant._id.toString(),
    permission: 'users.write',
  })
  if (permError) return { error: permError }

  if (!mongoose.isValidObjectId(userId)) {
    return { error: NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 }) }
  }
  const user = await User.findOne({ _id: userId, tenantId: tenant._id }).select('_id role name isActive')
  if (!user) return { error: NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 }) }

  return { tenant, user }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const target = await resolveTarget(request, params)
    if ('error' in target) return target.error
    const { tenant, user } = target

    if (!POS_PIN_ROLES.has(user.role)) {
      return NextResponse.json(
        { error: 'Este rol no opera el POS' },
        { status: 400 }
      )
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'El usuario está inactivo' }, { status: 409 })
    }

    const tenantId = tenant._id.toString()
    const issued = await issuePosPin(tenantId, user._id)
    if (!issued.ok) {
      return issued.reason === 'no_pepper'
        ? NextResponse.json({ error: 'PIN de POS no configurado en el servidor' }, { status: 503 })
        : NextResponse.json({ error: 'No se pudo generar un PIN único, reintentá' }, { status: 503 })
    }

    await logAudit({
      tenantId,
      action: 'user.pos_pin.generate',
      entity: 'User',
      entityId: user._id.toString(),
      details: { targetRole: user.role },
      request,
    })

    // Única vez que el PIN sale del server. No se loguea.
    return NextResponse.json(
      { pin: issued.pin, posPinUpdatedAt: issued.updatedAt.toISOString() },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[pos-pin] POST error:', error)
    return NextResponse.json({ error: 'Error al generar el PIN' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const target = await resolveTarget(request, params)
    if ('error' in target) return target.error
    const { tenant, user } = target

    await User.updateOne(
      { _id: user._id, tenantId: tenant._id },
      { $unset: { pin: 1, posPinLookup: 1 }, $set: { posPinUpdatedAt: null } }
    )

    await logAudit({
      tenantId: tenant._id.toString(),
      action: 'user.pos_pin.revoke',
      entity: 'User',
      entityId: user._id.toString(),
      details: {},
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[pos-pin] DELETE error:', error)
    return NextResponse.json({ error: 'Error al quitar el PIN' }, { status: 500 })
  }
}
