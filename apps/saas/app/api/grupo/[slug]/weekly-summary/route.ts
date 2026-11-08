import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { getSessionUser } from '@/lib/apiAuth'
import { connectDB } from '@/lib/mongoose'
import OrgMembership from '@/models/OrgMembership'
import Organization from '@/models/Organization'
import { DASHBOARD_ROLES } from '@/lib/organizations/dashboard'

// POST /api/grupo/[slug]/weekly-summary { enabled: boolean }
// Prende o apaga el resumen semanal por email de QUIEN LLAMA en esa
// organización. Solo su propia membresía activa y con acceso a los números.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser(request)
  if (!user?.id || !Types.ObjectId.isValid(String(user.id))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const enabled = (body as { enabled?: unknown })?.enabled
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Falta enabled' }, { status: 400 })

  const { slug } = await params
  await connectDB()
  const org = await Organization.findOne({ slug }).select('_id').lean<{ _id: Types.ObjectId }>()
  if (!org) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const r = await OrgMembership.updateOne(
    { organizationId: org._id, userId: new Types.ObjectId(String(user.id)), status: 'active', orgRole: { $in: [...DASHBOARD_ROLES] } },
    { $set: { 'weeklySummary.enabled': enabled } },
  )
  if (!r.matchedCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, enabled })
}
