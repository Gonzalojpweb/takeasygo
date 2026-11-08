import { NextRequest, NextResponse } from 'next/server'
import { canAccess } from '@/lib/plans'
import { rateLimit } from '@/lib/rateLimit'
import { priceContext } from '@/lib/menu/price-http'
import { ALLOWED_MEDIA, PriceImageError, type AllowedMedia } from '@/lib/menu/price-image'
import { menuFromImage } from '@/lib/menu/menu-from-image'

const MAX_BYTES = 10 * 1024 * 1024
export const maxDuration = 180

// POST /api/[tenant]/menu/import/from-image (multipart: file)
// Plan Élite: lee la carta completa de una foto o PDF y devuelve el JSON v1 para
// la vista previa. No escribe nada: se aplica con POST /api/[tenant]/menu/import.
// Solo Administrador y Manager; 10 lecturas por hora por comercio.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant, { applyOnly: true })
  if (!c.ok) return c.response
  if (!canAccess(c.ctx.plan, 'priceImport')) {
    return NextResponse.json({ error: 'Cargar la carta desde una foto es del plan Élite.', code: 'plan_required', requiredPlan: 'high' }, { status: 403 })
  }
  try {
    const limit = await rateLimit(`menu-image:${c.ctx.tenantId}`, 10, 3_600_000)
    if (!limit.success) return NextResponse.json({ error: 'Llegaste al límite de lecturas por hora. Probá más tarde.' }, { status: 429 })
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'Subí una foto o PDF de la carta.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo pesa más de 10 MB.' }, { status: 400 })
    const mediaType = file.type as AllowedMedia
    if (!(ALLOWED_MEDIA as readonly string[]).includes(mediaType)) return NextResponse.json({ error: 'Formato no admitido: usá JPG, PNG, WEBP o PDF.' }, { status: 400 })
    const data = Buffer.from(await file.arrayBuffer()).toString('base64')
    return NextResponse.json(await menuFromImage(data, mediaType))
  } catch (err) {
    if (err instanceof PriceImageError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[menu-import] from-image', err)
    return NextResponse.json({ error: 'No se pudo leer la carta' }, { status: 500 })
  }
}
