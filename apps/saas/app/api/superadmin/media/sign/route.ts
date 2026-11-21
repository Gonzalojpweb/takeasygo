/**
 * POST /api/superadmin/media/sign — subida de archivos de marketing (CP3).
 * Firma la subida directa a la cuenta ads (story, tarjeta de promo, banner).
 * Dueño: plataforma. Ver lib/media/ads.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { handleSign } from '@/lib/media/handlers'

const SURFACES = ['story', 'promo_card', 'home_banner'] as const

export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { success } = await rateLimit(`media-sign:sa:${ip}`, 60, 60_000)
  if (!success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })
  const body = await request.json().catch(() => null)
  return handleSign({ kind: 'platform' }, SURFACES, body)
}
