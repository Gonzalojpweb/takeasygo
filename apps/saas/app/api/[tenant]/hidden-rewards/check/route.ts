/**
 * POST /api/{tenant}/hidden-rewards/check
 *
 * Consulta si un teléfono tiene claims pendientes para los ítems del carrito.
 * Se llama al checkout antes de mostrar el precio final.
 *
 * Rate limit estricto: 3 consultas por IP en 60 segundos.
 * Respuesta uniforme: siempre { ok: true, claims: [] } — vacío si no hay nada,
 * para no filtrar información de terceros.
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
import { rateLimit } from '@/lib/rateLimit'
import { hashPhone } from '@/lib/crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { phone, menuItemIds } = body as {
      phone?: string
      menuItemIds?: string[]
    }

    if (!phone || !menuItemIds?.length) {
      // Respuesta uniforme: no validar, siempre OK
      return NextResponse.json({ ok: true, claims: [] })
    }

    // Rate limit estricto: 3 consultas por IP en 60s
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit(`hr-check:${tenantSlug}:${ip}`, 3, 60_000)
    if (!rl.success) {
      // Mismo código y shape que "no encontrado" — uniforme
      return NextResponse.json({ ok: true, claims: [] })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ ok: true, claims: [] })
    }

    const phoneHash = hashPhone(phone)
    const now = new Date()

    // Buscar claims pendientes para este teléfono que coincidan con los ítems del carrito
    const claims = await HiddenRewardClaim.find({
      tenantId: tenant._id,
      customerPhoneHash: phoneHash,
      menuItemId: { $in: menuItemIds },
      status: 'pendiente',
      expiresAt: { $gt: now },
    })
      .select('menuItemId discountPercentage rewardTitle rewardDescription expiresAt')
      .lean()

    // Respuesta uniforme: siempre ok:true con claims (vacío o no)
    return NextResponse.json({ ok: true, claims })
  } catch (error) {
    console.error('[Hidden Rewards Check] Error:', error)
    // Misma respuesta uniforme en error
    return NextResponse.json({ ok: true, claims: [] })
  }
}
