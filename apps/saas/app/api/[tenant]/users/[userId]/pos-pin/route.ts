import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { posPinLookup, resolvePosPinPepper, validateNewPosPin } from '@takeasygo/business/pos-pin'

// ============================================================================
// POST   /api/[tenant]/users/[userId]/pos-pin — genera (o regenera) el PIN
// DELETE /api/[tenant]/users/[userId]/pos-pin — quita el PIN
// ============================================================================
// El PIN lo GENERA el server (6 dígitos, no trivial, único en el tenant) y se
// devuelve UNA sola vez. Nadie lo elige a propósito: si el admin pudiera
// elegirlo, el "ese PIN ya está en uso" sería un oráculo para descubrir el PIN
// de otra persona (p. ej. un manager averiguando el del admin).
//
// Guardado: bcrypt en `pin` + HMAC en `posPinLookup` (ver
// @takeasygo/business/pos-pin). Roles con POS: caja (admin, manager,
// cashier → terminal hub) y mozos (staff, waiter → celular, POS mobile).
// ============================================================================

const POS_PIN_ROLES = new Set(['admin', 'manager', 'cashier', 'staff', 'waiter'])
const PIN_LENGTH = 6
const MAX_GENERATION_ATTEMPTS = 8

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

function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0')
    if (validateNewPosPin(pin) === null) return pin
  }
}

function isDuplicateLookup(error: unknown): boolean {
  const e = error as { code?: number; keyPattern?: Record<string, unknown> }
  return e?.code === 11000 && Boolean(e.keyPattern && 'posPinLookup' in e.keyPattern)
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

    const pepper = resolvePosPinPepper(process.env)
    if (!pepper) {
      console.error('[pos-pin] sin POS_PIN_PEPPER ni secreto interno: no se pueden emitir PINs')
      return NextResponse.json({ error: 'PIN de POS no configurado en el servidor' }, { status: 503 })
    }

    const tenantId = tenant._id.toString()
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const pin = generatePin()
      try {
        const updatedAt = new Date()
        await User.updateOne(
          { _id: user._id, tenantId: tenant._id },
          {
            $set: {
              pin: await bcrypt.hash(pin, 10),
              posPinLookup: posPinLookup(pepper, tenantId, pin),
              posPinUpdatedAt: updatedAt,
            },
          }
        )

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
          { pin, posPinUpdatedAt: updatedAt.toISOString() },
          { status: 201, headers: { 'Cache-Control': 'no-store' } }
        )
      } catch (error) {
        if (isDuplicateLookup(error)) continue // colisión con otro PIN del tenant: otro número
        throw error
      }
    }

    return NextResponse.json({ error: 'No se pudo generar un PIN único, reintentá' }, { status: 503 })
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
