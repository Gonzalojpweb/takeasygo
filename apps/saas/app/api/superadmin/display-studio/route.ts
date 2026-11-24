/**
 * POST /api/superadmin/display-studio { tenantId, templateId, action: 'grant'|'revoke' }
 * El SuperAdmin desbloquea (o retira) una plantilla Premium sin cobro: pilotos,
 * cortesías o un pago que entró por otro lado. Queda auditado.
 * GET ?tenantId= → compras del comercio.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin, getSessionUser } from '@/lib/apiAuth'
import Tenant from '@/models/Tenant'
import DisplayTemplatePurchase from '@/models/DisplayTemplatePurchase'
import { studioTemplate } from '@/lib/display/studio/catalog'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin('superadmin', request)
  if (authError) return authError
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) return NextResponse.json({ error: 'Comercio inválido' }, { status: 400 })
  await connectDB()
  const rows = await DisplayTemplatePurchase.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).select('templateId status source amountArs amountUsd approvedAt receiptNumber createdAt').lean()
  return NextResponse.json({ purchases: rows })
}

export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin('superadmin', request)
  if (authError) return authError
  const b = z.object({
    tenantId: z.string().refine((x) => mongoose.Types.ObjectId.isValid(x)),
    templateId: z.string().max(60),
    action: z.enum(['grant', 'revoke']),
  }).safeParse(await request.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  const t = studioTemplate(b.data.templateId)
  if (!t || t.tier !== 'premium') return NextResponse.json({ error: 'Plantilla Premium inexistente' }, { status: 400 })
  await connectDB()
  const tid = new mongoose.Types.ObjectId(b.data.tenantId)
  if (!(await Tenant.exists({ _id: tid }))) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const user = await getSessionUser(request)
  const by = user?.id && mongoose.Types.ObjectId.isValid(String(user.id)) ? new mongoose.Types.ObjectId(String(user.id)) : null
  if (b.data.action === 'grant') {
    await DisplayTemplatePurchase.updateOne(
      { tenantId: tid, templateId: t.id },
      { $set: { status: 'approved', source: 'manual', amountArs: 0, amountUsd: 0, rate: 0, approvedAt: new Date(), grantedBy: by } },
      { upsert: true },
    )
  } else {
    await DisplayTemplatePurchase.updateOne({ tenantId: tid, templateId: t.id }, { $set: { status: 'refunded' } })
  }
  logAudit({ tenantId: '', action: `display.template_${b.data.action}`, entity: 'display_template', entityId: `${b.data.tenantId}:${t.id}`, details: { tenantId: b.data.tenantId, templateId: t.id }, request })
  return NextResponse.json({ ok: true })
}
