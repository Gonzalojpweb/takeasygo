import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import { guardLocations, priceContext, priceErrorResponse, priceImportDenied } from '@/lib/menu/price-http'
import { ALLOWED_MEDIA, PriceImageError, pricesFromImage, type AllowedMedia } from '@/lib/menu/price-image'
import { rateLimit } from '@/lib/rateLimit'

const MAX_BYTES = 10 * 1024 * 1024

export const maxDuration = 120

// POST /api/[tenant]/menu/prices/from-image (multipart: file, locationId)
// Lee una foto o PDF de la carta nueva con IA y devuelve los precios como
// ajustes a mano para la vista previa. No escribe nada. Solo Administrador y
// Manager (gasta API); 10 por hora por comercio.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant, { applyOnly: true })
  if (!c.ok) return c.response
  const planDenied = priceImportDenied(c.ctx)
  if (planDenied) return planDenied
  try {
    const limit = await rateLimit(`price-image:${c.ctx.tenantId}`, 10, 3_600_000)
    if (!limit.success) return NextResponse.json({ error: 'Llegaste al límite de lecturas por hora. Probá más tarde.' }, { status: 429 })
    const form = await request.formData()
    const file = form.get('file')
    const locationId = String(form.get('locationId') ?? '')
    if (!mongoose.Types.ObjectId.isValid(locationId)) return NextResponse.json({ error: 'Elegí una sede' }, { status: 400 })
    const denied = await guardLocations(request, [locationId])
    if (denied) return denied
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'Subí una foto o PDF de la carta.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo pesa más de 10 MB.' }, { status: 400 })
    const mediaType = file.type as AllowedMedia
    if (!(ALLOWED_MEDIA as readonly string[]).includes(mediaType)) return NextResponse.json({ error: 'Formato no admitido: usá JPG, PNG, WEBP o PDF.' }, { status: 400 })
    const menu = await Menu.findOne({ tenantId: c.ctx.tenantId, locationId }).lean()
    if (!menu) return NextResponse.json({ error: 'La sede no tiene carta' }, { status: 404 })
    const data = Buffer.from(await file.arrayBuffer()).toString('base64')
    return NextResponse.json(await pricesFromImage(menu as never, data, mediaType))
  } catch (err) {
    if (err instanceof PriceImageError) return NextResponse.json({ error: err.message }, { status: err.status })
    return priceErrorResponse(err, 'from-image')
  }
}
