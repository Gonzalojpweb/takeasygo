/**
 * POST /api/[tenant]/display-studio/remove-bg { url } — «Quitar fondo HD»
 * (nivel 3 del modo híbrido, plan §8). Solo si DISPLAY_STUDIO_BG_REMOVAL es
 * 'cloudinary' o 'both' y el add-on de Cloudinary está activo en la cuenta ads.
 * Devuelve la URL derivada `e_background_removal/f_png` de la MISMA imagen
 * (Cloudinary la calcula una sola vez y la guarda). Tope mensual por comercio.
 * Los niveles gratis (PNG recortado y quitar fondo en el navegador) no pasan por acá.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { screenPiecesContext } from '@/lib/display/pieces-route'
import { bgRemovalMode, bgRemovalMonthlyCap, studioEnabled } from '@/lib/display/studio/flags'
import { studioMediaError } from '@/lib/display/composition-media'
import { adsAssetFromUrl } from '@/lib/media/ads'
import { adsCreds, cloudinarySdk as cloudinary } from '@/lib/cloudinary'
import { DisplayStudioState } from '@/models/DisplayTemplatePurchase'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  if (!studioEnabled() || bgRemovalMode() === 'free') return NextResponse.json({ error: 'Quitar fondo HD no está activado. Usá «Quitar fondo gratis» o subí un PNG sin fondo.' }, { status: 404 })
  const b = z.object({ url: z.string().url().max(600) }).safeParse(await request.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Imagen inválida' }, { status: 400 })
  const err = studioMediaError([b.data.url], ctx.tenantId)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const asset = adsAssetFromUrl(b.data.url)!

  const month = new Date().toISOString().slice(0, 7)
  const key = `bg:${ctx.tenantId}:${month}`
  const cap = bgRemovalMonthlyCap()
  // Se reserva el uso antes de pedirlo (atómico): nunca se pasa del tope.
  await DisplayStudioState.updateOne({ _id: key }, { $setOnInsert: { seq: 0 } }, { upsert: true }).catch(() => {})
  const used = await DisplayStudioState.findOneAndUpdate({ _id: key, seq: { $lt: cap } }, { $inc: { seq: 1 } }, { new: true }).lean()
  if (!used) return NextResponse.json({ error: `Llegaste al tope de ${cap} «Quitar fondo HD» de este mes. Usá «Quitar fondo gratis».`, code: 'cap' }, { status: 429 })

  const { cloud_name } = adsCreds()
  const url = cloudinary.url(asset.publicId, { cloud_name, secure: true, resource_type: 'image', transformation: [{ effect: 'background_removal' }], format: 'png', urlAnalytics: false } as never)
  logAudit({ tenantId: ctx.tenantId, action: 'display.studio_bg_removal', entity: 'display_template', entityId: asset.publicId, details: { month, used: used.seq, cap } })
  return NextResponse.json({ url, used: used.seq, cap })
}
