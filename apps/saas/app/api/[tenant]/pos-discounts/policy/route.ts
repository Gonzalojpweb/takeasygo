import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import User from '@/models/User'
import { logAudit } from '@/lib/audit'
import { validateDiscountPolicyInput } from '@takeasygo/business'
import { DISCOUNT_EDIT_ROLES, DISCOUNT_VIEW_ROLES, discountAdminContext } from '@/lib/pos-online/discountAdmin'
import { PolicyVersionConflict, loadDiscountPolicy, saveDiscountPolicy } from '@/lib/pos-online/discountPolicy'

// ============================================================================
// /api/[tenant]/pos-discounts/policy — política de descuentos del comercio
// ============================================================================
// GET (admin, encargado): la política vigente y su versión.
// PUT (solo admin) { expectedVersion, policy }: valida estricto
//     (validateDiscountPolicyInput), guarda con control de versión (dos
//     admins no se pisan) y deja auditoría con el antes y el después.
// Rige al instante en el server; los POS la toman al abrir el diálogo / la
// caja. Lo hecho sin internet con la versión anterior se sigue aceptando
// (historial de versiones).
// ============================================================================

async function nameOf(userId: string | null): Promise<string | null> {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null
  const u = await User.findById(userId).select('name').lean<{ name?: string }>()
  return u?.name ?? null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const ctx = await discountAdminContext(request, tenant, DISCOUNT_VIEW_ROLES)
  if (ctx instanceof NextResponse) return ctx
  const loaded = await loadDiscountPolicy(ctx.tenantId)
  return NextResponse.json({
    version: loaded.version,
    policy: loaded.policy,
    updatedAt: loaded.updatedAt,
    updatedByName: await nameOf(loaded.updatedBy),
    canEdit: (DISCOUNT_EDIT_ROLES as readonly string[]).includes(ctx.role) || ctx.role === 'superadmin',
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const ctx = await discountAdminContext(request, tenant, DISCOUNT_EDIT_ROLES)
  if (ctx instanceof NextResponse) return ctx

  let body: { expectedVersion?: unknown; policy?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (typeof body.expectedVersion !== 'number' || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 0) {
    return NextResponse.json({ error: 'Falta la versión que estabas editando' }, { status: 400 })
  }
  const parsed = validateDiscountPolicyInput(body.policy)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const before = await loadDiscountPolicy(ctx.tenantId)
  try {
    const saved = await saveDiscountPolicy(ctx.tenantId, parsed.policy, body.expectedVersion, ctx.userId)
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'pos.discount_policy.update',
      entity: 'PosDiscountPolicy',
      entityId: ctx.tenantId,
      details: { fromVersion: before.version, toVersion: saved.version, before: before.policy, after: saved.policy },
      request,
      userId: ctx.userId,
      userRole: ctx.role,
    })
    return NextResponse.json({ version: saved.version, policy: saved.policy, updatedAt: saved.updatedAt, updatedByName: await nameOf(ctx.userId), canEdit: true })
  } catch (err) {
    if (err instanceof PolicyVersionConflict) {
      return NextResponse.json({ error: 'Otra persona cambió la política mientras la editabas. Recargá para ver la versión actual.' }, { status: 409 })
    }
    throw err
  }
}
