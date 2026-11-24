/**
 * POST /api/[tenant]/display-studio/[templateId]/checkout — inicia la compra de
 * una plantilla Premium con MercadoPago (cuenta de la plataforma). Compran el
 * administrador y el encargado (manager). Devuelve { initPoint, amount, rate }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { screenPiecesContext } from '@/lib/display/pieces-route'
import { getSessionUser } from '@/lib/apiAuth'
import { studioEnabled } from '@/lib/display/studio/flags'
import { createTemplateCheckout } from '@/lib/display/studio/purchase'
import { getBaseUrl } from '@/lib/site-url'
import User from '@/models/User'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string; templateId: string }> }) {
  const p = await params
  const ctx = await screenPiecesContext(request, Promise.resolve({ tenant: p.tenant }))
  if ('error' in ctx) return ctx.error
  if (!studioEnabled()) return NextResponse.json({ error: 'No disponible' }, { status: 404 })
  try {
    const user = await getSessionUser(request)
    const payerEmail = user?.id ? (await User.findById(user.id).select('email').lean<{ email?: string }>())?.email : undefined
    const r = await createTemplateCheckout({ tenantId: ctx.tenantId, tenantSlug: p.tenant, templateId: p.templateId, appUrl: getBaseUrl(request), payerEmail, userId: user?.id ? String(user.id) : null })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ initPoint: r.initPoint, amount: r.amountCents / 100, rate: r.rate })
  } catch (e) {
    console.error('[display-studio/checkout]', e)
    return NextResponse.json({ error: 'No se pudo iniciar el pago. Reintentá en unos segundos.' }, { status: 500 })
  }
}
