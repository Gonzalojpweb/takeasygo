/**
 * POST /api/[tenant]/display-studio/confirm { paymentId } — a la vuelta de
 * MercadoPago el panel confirma el pago sin esperar al webhook. El pago se
 * consulta a la API de MP (nunca se confía en el parámetro) y la aplicación
 * es idempotente: si el webhook llegó antes, no pasa nada.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { screenPiecesContext } from '@/lib/display/pieces-route'
import { applyTemplatePayment } from '@/lib/display/studio/purchase'
import { unlockedTemplateIds } from '@/models/DisplayTemplatePurchase'
import { getBaseUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const b = z.object({ paymentId: z.string().regex(/^\d{1,20}$/) }).safeParse(await request.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Pago inválido' }, { status: 400 })
  try {
    const r = await applyTemplatePayment(b.data.paymentId, undefined, getBaseUrl(request))
    // De otro comercio: no se cuenta nada de esa compra.
    const status = r.tenantId && r.tenantId !== ctx.tenantId ? 'ignored' : r.status
    return NextResponse.json({ status, unlocked: [...(await unlockedTemplateIds(ctx.tenantId))] })
  } catch (e) {
    console.error('[display-studio/confirm]', e)
    return NextResponse.json({ error: 'No pudimos confirmar el pago todavía. Se acredita solo en unos minutos.' }, { status: 502 })
  }
}
