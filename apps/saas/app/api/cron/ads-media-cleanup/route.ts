/**
 * GET /api/cron/ads-media-cleanup — borra archivos de marketing huérfanos (CP3).
 *
 * Todo lo que se sube a la cuenta ads lleva la etiqueta 'pending' hasta que
 * se guarda (lib/media/ads.ts → markSaved). Lo que sigue 'pending' después de
 * 24 h se revisa: si alguna story, promo, tarjeta del club o QrPromo lo usa,
 * se le quita 'pending' y se conserva; si nadie lo usa, se borra. Solo la
 * cuenta ads: las fotos de los menús no se tocan. Protegido con CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/apiAuth'
import { connectDB } from '@/lib/mongoose'
import { adsCreds, cloudinarySdk as cloudinary } from '@/lib/cloudinary'
import { PENDING_TAG } from '@/lib/media/ads'
import { referencedPublicIds } from '@/lib/media/cleanup'

export const dynamic = 'force-dynamic'

const MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const authError = await requireCronSecret(request)
  if (authError) return authError
  try {
    await connectDB()
    const creds = adsCreds()
    const cutoff = Date.now() - MAX_AGE_MS
    const summary: Record<string, { borrados: number; conservados: number }> = {}
    for (const kind of ['image', 'video'] as const) {
      const res = await cloudinary.api.resources_by_tag(PENDING_TAG, { ...creds, resource_type: kind, max_results: 500 }) as { resources?: Array<{ public_id: string; created_at: string }> }
      const old = (res.resources ?? []).filter((r) => new Date(r.created_at).getTime() < cutoff).map((r) => r.public_id)
      const used = await referencedPublicIds(old)
      const keep = old.filter((p) => used.has(p))
      const drop = old.filter((p) => !used.has(p))
      if (keep.length) await cloudinary.uploader.remove_tag(PENDING_TAG, keep, { ...creds, resource_type: kind })
      for (let i = 0; i < drop.length; i += 100) {
        await cloudinary.api.delete_resources(drop.slice(i, i + 100), { ...creds, resource_type: kind, invalidate: true })
      }
      summary[kind] = { borrados: drop.length, conservados: keep.length }
    }
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error('[cron/ads-media-cleanup]', (error as Error)?.message)
    return NextResponse.json({ error: 'No se pudo limpiar' }, { status: 500 })
  }
}
