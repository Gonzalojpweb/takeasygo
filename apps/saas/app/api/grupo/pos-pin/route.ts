import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { SAAS_TO_POS_ROLE } from '@takeasygo/business'
import { connectDB } from '@/lib/mongoose'
import { getSessionUser } from '@/lib/apiAuth'
import { getMyOrganizations } from '@/lib/organizations/me'
import { getOrgAccessMode, getPosMultiBrandMode } from '@/lib/org-access'
import { issueMemberPosPin } from '@/lib/pos-online/pinIssue'
import { logAudit } from '@/lib/audit'
import PosCredential from '@/models/PosCredential'

// ============================================================================
// /api/grupo/pos-pin — PIN del POS de un miembro en una marca de su grupo
// (multi-marca D6)
// ============================================================================
// GET                      → marcas donde tiene PIN (sin el PIN).
// POST   { tenantSlug }    → genera un PIN nuevo y lo devuelve UNA vez.
// DELETE { tenantSlug }    → borra su PIN de esa marca.
// Exige pos.multiBrand y org.access en enforce, que la membresía le dé esa
// marca con un rol que use el POS (el contador no) y que no sea su comercio
// de origen (ahí usa el PIN que le da su admin). El Sync vuelve a validar la
// membresía en cada login y renovación.
// ============================================================================

type Ctx = { userId: string; homeTenantId: string | null }

async function context(request: NextRequest): Promise<{ ok: true; ctx: Ctx } | { ok: false; response: NextResponse }> {
  const user = await getSessionUser(request)
  if (!user?.id) return { ok: false, response: NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 }) }
  const [pos, org] = await Promise.all([getPosMultiBrandMode(), getOrgAccessMode()])
  if (pos !== 'on' || org !== 'enforce') {
    return { ok: false, response: NextResponse.json({ error: 'El POS multimarca no está activado.', code: 'pos_multibrand_off' }, { status: 409 }) }
  }
  return { ok: true, ctx: { userId: String(user.id), homeTenantId: user.tenantId ? String(user.tenantId) : null } }
}

async function brandFor(ctx: Ctx, slug: unknown) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{2,60}$/.test(slug)) return { error: NextResponse.json({ error: 'Marca inválida.' }, { status: 400 }) }
  const brand = (await getMyOrganizations(ctx.userId)).flatMap(o => o.brands).find(b => b.slug === slug)
  if (!brand) return { error: NextResponse.json({ error: 'No tenés acceso a esa marca.' }, { status: 404 }) }
  if (brand.tenantId === ctx.homeTenantId) {
    return { error: NextResponse.json({ error: 'Es tu comercio: usá el PIN que te da el administrador.', code: 'home_tenant' }, { status: 409 }) }
  }
  if (!SAAS_TO_POS_ROLE[brand.role]) {
    return { error: NextResponse.json({ error: 'Tu rol en esa marca no usa el POS.', code: 'role_not_pos' }, { status: 403 }) }
  }
  return { brand }
}

export async function GET(request: NextRequest) {
  const c = await context(request)
  if (!c.ok) return c.response
  await connectDB()
  const creds = await PosCredential.find({ userId: new mongoose.Types.ObjectId(c.ctx.userId) }).select('tenantId updatedAt').lean<{ tenantId: unknown; updatedAt: Date }[]>()
  return NextResponse.json({ credentials: creds.map(x => ({ tenantId: String(x.tenantId), updatedAt: x.updatedAt })) })
}

export async function POST(request: NextRequest) {
  const c = await context(request)
  if (!c.ok) return c.response
  const body = await request.json().catch(() => ({}))
  const b = await brandFor(c.ctx, (body as { tenantSlug?: unknown }).tenantSlug)
  if ('error' in b) return b.error
  await connectDB()
  const r = await issueMemberPosPin(b.brand.tenantId, c.ctx.userId)
  if (!r.ok) return NextResponse.json({ error: 'No se pudo generar el PIN. Probá de nuevo en un rato.' }, { status: 503 })
  await logAudit({
    tenantId: b.brand.tenantId, action: 'pos.member_pin.issue', entity: 'PosCredential', entityId: c.ctx.userId,
    details: { via: 'membership' }, request, userId: c.ctx.userId, userRole: `org:${b.brand.role}`,
  })
  return NextResponse.json({ pin: r.pin, tenantId: b.brand.tenantId, updatedAt: r.updatedAt }, { headers: { 'cache-control': 'no-store' } })
}

export async function DELETE(request: NextRequest) {
  const c = await context(request)
  if (!c.ok) return c.response
  const body = await request.json().catch(() => ({}))
  const slug = (body as { tenantSlug?: unknown }).tenantSlug
  const brand = typeof slug === 'string' ? (await getMyOrganizations(c.ctx.userId)).flatMap(o => o.brands).find(x => x.slug === slug) : null
  if (!brand) return NextResponse.json({ error: 'No tenés acceso a esa marca.' }, { status: 404 })
  await connectDB()
  await PosCredential.deleteOne({ userId: new mongoose.Types.ObjectId(c.ctx.userId), tenantId: new mongoose.Types.ObjectId(brand.tenantId) })
  return NextResponse.json({ deleted: true })
}
