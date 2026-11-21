/**
 * POST /api/display/pair/status — la pantalla consulta si ya la vincularon.
 *
 * Body: { pairingId, nonce }. Respuestas:
 *  · 200 { status: 'pending', expiresAt }
 *  · 200 { status: 'active', token, device } — UNA sola vez: se genera el
 *    token, se guarda solo su hash y la pantalla queda activa.
 *  · 410 { status: 'expired' | 'used' | 'revoked' }
 * Con 5 nonces equivocados para el mismo pairingId, el código se anula.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import DisplayDevice from '@/models/DisplayDevice'
import Location from '@/models/Location'
import { generateDisplayToken, hashDisplayToken, hashNonce, ipRateKey, MAX_NONCE_ATTEMPTS, DisplayConfigError } from '@/lib/display/auth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  pairingId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v)),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
})

const gone = (status: string) => NextResponse.json({ status }, { status: 410, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: NextRequest) {
  try {
    const rl = await rateLimit(ipRateKey(request, 'status'), 120, 10 * 60_000)
    if (!rl.success) return NextResponse.json({ error: 'Demasiadas consultas' }, { status: 429 })
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })

    await connectDB()
    const doc = await DisplayDevice.findById(parsed.data.pairingId).lean()
    if (!doc) return gone('expired')
    if (doc.status === 'active') return gone('used')
    if (doc.status === 'revoked') return gone('revoked')
    if (!doc.pairing || !doc.pairingExpiresAt || doc.pairingExpiresAt.getTime() <= Date.now()) return gone('expired')

    const nonceHash = hashNonce(parsed.data.nonce)
    if (doc.pairing.nonceHash !== nonceHash) {
      const attempts = (doc.pairing.attempts ?? 0) + 1
      if (attempts >= MAX_NONCE_ATTEMPTS) await DisplayDevice.deleteOne({ _id: doc._id, status: { $in: ['pending', 'claimed'] } })
      else await DisplayDevice.updateOne({ _id: doc._id }, { $set: { 'pairing.attempts': attempts } })
      return NextResponse.json({ error: 'No corresponde a esta pantalla' }, { status: 403 })
    }

    if (doc.status === 'pending') {
      return NextResponse.json({ status: 'pending', expiresAt: doc.pairingExpiresAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // claimed → se entrega el token una sola vez (atómico: si otro pedido ganó, 410).
    const token = generateDisplayToken()
    const activated = await DisplayDevice.findOneAndUpdate(
      { _id: doc._id, status: 'claimed', 'pairing.nonceHash': nonceHash },
      { $set: { status: 'active', tokenHash: hashDisplayToken(token), tokenPrefix: token.slice(0, 8), pairedAt: new Date() }, $unset: { pairing: 1, pairingExpiresAt: 1 } },
      { returnDocument: 'after' },
    ).lean()
    if (!activated) return gone('used')
    const loc = activated.locationId ? await Location.findById(activated.locationId).select('name').lean<{ name?: string }>() : null
    return NextResponse.json({
      status: 'active',
      token,
      device: { name: activated.name, orientation: activated.orientation, locationName: loc?.name ?? null },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof DisplayConfigError) return NextResponse.json({ error: 'La vinculación de pantallas no está configurada' }, { status: 503 })
    console.error('[display/pair/status]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo consultar' }, { status: 500 })
  }
}
