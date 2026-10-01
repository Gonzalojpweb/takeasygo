import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/network/logos
 * Público (sin auth). Devuelve los logos de la red de restaurantes activos
 * que ya cobran por Mercado Pago o cuenta MP y también por transferencia.
 * Pensado para la pantalla de "estado de la solicitud": prueba social sin
 * exponer datos sensibles.
 */
export async function GET() {
  try {
    const limit = await rateLimit('api:network-logos', 60, 60_000)
    if (!limit.success) {
      return NextResponse.json(
        { logos: [] },
        { status: 429, headers: { 'Cache-Control': 'public, max-age=60' } }
      )
    }

    await connectDB()

    const mpOn = {
      $or: [{ 'mercadopago.isConfigured': true }, { mpAccounts: { $elemMatch: { isActive: true } } }],
    }
    const transferOn = {
      $or: [{ transferAccounts: { $elemMatch: { isActive: true } } }, { 'transfer.enabled': true }],
    }

    const docs = await Tenant.find({
      status: 'active',
      $and: [mpOn, transferOn],
    })
      .select({ slug: 1, name: 1, 'branding.logoUrl': 1 })
      .lean()

    const logos = docs
      .map((t) => ({
        slug: t.slug as string,
        name: t.name as string,
        logoUrl: (t.branding as { logoUrl?: string } | undefined)?.logoUrl ?? '',
      }))
      .filter((l) => Boolean(l.logoUrl))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(
      { logos },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  } catch (error) {
    console.error('[network/logos]', error)
    return NextResponse.json({ logos: [] }, { status: 500 })
  }
}
