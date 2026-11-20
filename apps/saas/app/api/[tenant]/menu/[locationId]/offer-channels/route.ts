import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import Combo from '@/models/Combo'
import { comboChannels, promotionChannels, type SalesChannel } from '@/lib/sales-channels'

// ============================================================================
// GET /api/[tenant]/menu/[locationId]/offer-channels?promotionIds=&comboIds=
// ============================================================================
// Público (20/11/2026): el checkout pregunta en qué canales vale cada promo o
// combo del carrito para avisar ANTES de pagar («El Combo X es solo para
// delivery» → Cambiar a delivery / Quitar). Solo título y canales.
// ============================================================================

const MAX_IDS = 30

function idsFrom(param: string | null): string[] {
  if (!param) return []
  return [...new Set(param.split(','))].filter((id) => mongoose.isValidObjectId(id)).slice(0, MAX_IDS)
}

type OfferInfo = { title: string; channels: SalesChannel[] }

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string; locationId: string }> }) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const sp = new URL(request.url).searchParams
    const promotionIds = idsFrom(sp.get('promotionIds'))
    const comboIds = idsFrom(sp.get('comboIds'))
    if (!mongoose.isValidObjectId(locationId) || (promotionIds.length === 0 && comboIds.length === 0)) {
      return NextResponse.json({ promotions: {}, combos: {} })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const [promos, combos] = await Promise.all([
      promotionIds.length
        ? Promotion.find({ _id: { $in: promotionIds }, tenantId: tenant._id }).select('title channels').lean()
        : [],
      comboIds.length
        ? Combo.find({ _id: { $in: comboIds }, tenantId: tenant._id }).select('name channels visibility').lean()
        : [],
    ])

    const promotions: Record<string, OfferInfo> = {}
    for (const p of promos as unknown as Array<{ _id: unknown; title: string; channels?: unknown }>) promotions[String(p._id)] = { title: p.title, channels: promotionChannels(p) }
    const combosOut: Record<string, OfferInfo> = {}
    for (const c of combos as unknown as Array<{ _id: unknown; name: string; channels?: unknown; visibility?: unknown }>) combosOut[String(c._id)] = { title: c.name, channels: comboChannels(c) }

    return NextResponse.json({ promotions, combos: combosOut })
  } catch (error) {
    console.error('[menu/offer-channels]', error)
    return NextResponse.json({ error: 'No se pudieron consultar los canales' }, { status: 500 })
  }
}
