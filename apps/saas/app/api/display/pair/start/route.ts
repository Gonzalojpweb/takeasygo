/**
 * POST /api/display/pair/start — la pantalla pide un código de vinculación.
 *
 * Body: { nonce } (al azar, lo guarda la pantalla: solo quien lo tenga podrá
 * retirar el token). Devuelve { pairingId, code, expiresAt, linkUrl }.
 * Límites por IP hasheada (nunca se guarda en claro): 3 códigos cada 10 min y
 * 10 por hora.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import DisplayDevice from '@/models/DisplayDevice'
import { generateCode, hashCode, hashNonce, ipRateKey, PAIRING_TTL_MS, DisplayConfigError } from '@/lib/display/auth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ nonce: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) })

export async function POST(request: NextRequest) {
  try {
    const short = await rateLimit(ipRateKey(request, 'pair10m'), 3, 10 * 60_000)
    const hour = await rateLimit(ipRateKey(request, 'pair1h'), 10, 60 * 60_000)
    if (!short.success || !hour.success) {
      return NextResponse.json({ error: 'Demasiados códigos pedidos desde esta red. Esperá unos minutos.' }, { status: 429 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })

    await connectDB()
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS)
    // Reintenta si el código (hasheado) choca con otro pendiente.
    for (let i = 0; i < 5; i++) {
      const code = generateCode()
      try {
        const doc = await DisplayDevice.create({
          status: 'pending',
          pairing: { codeHash: hashCode(code), nonceHash: hashNonce(parsed.data.nonce), attempts: 0 },
          pairingExpiresAt: expiresAt,
        })
        return NextResponse.json({
          pairingId: String(doc._id),
          code,
          expiresAt: expiresAt.toISOString(),
          linkUrl: `${request.nextUrl.origin}/pantalla/vincular?code=${code}`,
        }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
      } catch (e) {
        if ((e as { code?: number })?.code !== 11000) throw e
      }
    }
    return NextResponse.json({ error: 'No se pudo generar un código. Probá de nuevo.' }, { status: 503 })
  } catch (e) {
    if (e instanceof DisplayConfigError) return NextResponse.json({ error: 'La vinculación de pantallas no está configurada' }, { status: 503 })
    console.error('[display/pair/start]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo generar el código' }, { status: 500 })
  }
}
