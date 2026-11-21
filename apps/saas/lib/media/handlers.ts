// Lógica compartida de las rutas de firma y verificación (Super Admin y comercio).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { signUpload, verifyUpload, cloudinaryAdsApi, type AdsApi, type MediaOwner } from '@/lib/media/ads'
import type { MediaSurface } from '@/lib/media/spec'

const signSchema = z.object({
  surface: z.enum(['story', 'promo_card', 'home_banner', 'club_card', 'qr_promo']),
  kind: z.enum(['image', 'video']),
})
const confirmSchema = signSchema.extend({ publicId: z.string().min(1).max(200) })

export async function handleSign(owner: MediaOwner, allowed: readonly MediaSurface[], body: unknown) {
  const parsed = signSchema.safeParse(body)
  if (!parsed.success || !allowed.includes(parsed.data.surface)) {
    return NextResponse.json({ error: 'Superficie o tipo de archivo no admitido' }, { status: 400 })
  }
  try {
    return NextResponse.json(signUpload(owner, parsed.data.surface, parsed.data.kind))
  } catch (e) {
    const msg = (e as Error)?.message || ''
    if (msg.includes('credenciales')) {
      console.error('[media/sign]', msg)
      return NextResponse.json({ error: 'La subida de archivos no está configurada' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Superficie o tipo de archivo no admitido' }, { status: 400 })
  }
}

export async function handleConfirm(owner: MediaOwner, allowed: readonly MediaSurface[], body: unknown, api: AdsApi = cloudinaryAdsApi()) {
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success || !allowed.includes(parsed.data.surface)) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const { surface, kind, publicId } = parsed.data
  try {
    const r = await verifyUpload(owner, surface, kind, publicId, api)
    if (!r.ok) return NextResponse.json({ error: r.error, deleted: r.deleted }, { status: r.status })
    return NextResponse.json({ media: r.media })
  } catch (e) {
    console.error('[media/confirm]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo verificar el archivo. Probá de nuevo.' }, { status: 502 })
  }
}
