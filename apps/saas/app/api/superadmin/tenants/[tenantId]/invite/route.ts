import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import { regenerateInvite } from '@/lib/provisioning/provision'
import { appBaseUrl, provisionContext, provisionErrorResponse } from '@/lib/provisioning/http'

// POST /api/superadmin/tenants/[tenantId]/invite — nuevo link de invitación para
// el dueño (el anterior deja de servir). Body opcional: { sendEmail: boolean }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const c = await provisionContext(request)
  if (!c.ok) return c.response
  const { tenantId } = await params
  if (!mongoose.Types.ObjectId.isValid(tenantId)) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  try {
    const limit = await rateLimit(`provision:invite:${tenantId}`, 10, 60 * 60_000)
    if (!limit.success) return NextResponse.json({ error: 'Demasiados reenvíos. Probá más tarde.' }, { status: 429 })
    const body = (await request.json().catch(() => ({}))) as { sendEmail?: unknown }
    await connectDB()
    const result = await regenerateInvite(tenantId, { appUrl: appBaseUrl(request), sendEmail: body.sendEmail !== false })
    await logAudit({ tenantId, action: 'tenant.invite.regenerated', entity: 'user', userId: c.actor.userId, userName: c.actor.name, userRole: 'superadmin', details: { emailSent: result.emailSent } })
    return NextResponse.json(result)
  } catch (err) {
    return provisionErrorResponse(err, 'invite')
  }
}
