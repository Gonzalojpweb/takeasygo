/**
 * POST /api/{tenant}/hidden-rewards/check
 *
 * Consulta si un dispositivo o teléfono tiene claims para los ítems del carrito.
 * Se llama al checkout antes de mostrar el precio final.
 *
 * Busca de dos formas:
 * 1. Por deviceId (cookie hr_sid) + status 'reserva' → claims recién descubiertos
 * 2. Por phone hash + status 'pendiente' → claims vinculados de pedidos anteriores
 *
 * Rate limit estricto: 3 consultas por IP en 60 segundos.
 * Respuesta uniforme: siempre { ok: true, claims: [] } — vacío si no hay nada,
 * para no filtrar información de terceros.
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
import { rateLimit } from '@/lib/rateLimit'
import { hashPhone } from '@/lib/crypto'
import { getDeviceIdIfExists } from '@/lib/hidden-rewards'

const SELECT_FIELDS = 'menuItemId locationId discountPercentage rewardTitle rewardDescription expiresAt'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { phone, menuItemIds, locationId } = body as {
      phone?: string
      menuItemIds?: string[]
      locationId?: string
    }

    if (!menuItemIds?.length) {
      return NextResponse.json({ ok: true, claims: [] })
    }

    // Multi-sede (B): si el cliente explica su sede, filtrar claims por sede.
    // locationId inválido → no exponer nada (respuesta uniforme)
    const claimLocationId = locationId && mongoose.isValidObjectId(locationId)
      ? new mongoose.Types.ObjectId(locationId)
      : null
    const locationFilter = claimLocationId ? { locationId: claimLocationId } : {}

    // Rate limit estricto: 3 consultas por IP en 60s
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit(`hr-check:${tenantSlug}:${ip}`, 3, 60_000)
    if (!rl.success) {
      return NextResponse.json({ ok: true, claims: [] })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ ok: true, claims: [] })
    }

    const now = new Date()

    // ── 1. Buscar por deviceId (reservas recién descubiertas) ──────────
    const deviceId = await getDeviceIdIfExists()
    const reservaClaims = deviceId
      ? await HiddenRewardClaim.find({
          tenantId: tenant._id,
          deviceId,
          menuItemId: { $in: menuItemIds },
          ...locationFilter,
          status: 'reserva',
          reservationExpiresAt: { $gt: now },
        })
          .select(SELECT_FIELDS)
          .lean()
      : []

    // ── 2. Buscar por teléfono (claims vinculados de pedidos anteriores) ──
    let phoneClaims: any[] = []
    if (phone) {
      const phoneHash = hashPhone(phone)
      phoneClaims = await HiddenRewardClaim.find({
        tenantId: tenant._id,
        customerPhoneHash: phoneHash,
        menuItemId: { $in: menuItemIds },
        ...locationFilter,
        status: 'pendiente',
        expiresAt: { $gt: now },
      })
        .select(SELECT_FIELDS)
        .lean()
    }

    // Combinar resultados (deduplicar por menuItemId — preferir reserva sobre pendiente)
    const seen = new Set<string>()
    const claims: any[] = []
    for (const c of [...reservaClaims, ...phoneClaims]) {
      const key = c.menuItemId.toString()
      if (!seen.has(key)) {
        seen.add(key)
        claims.push(c)
      }
    }

    return NextResponse.json({ ok: true, claims })
  } catch (error) {
    console.error('[Hidden Rewards Check] Error:', error)
    return NextResponse.json({ ok: true, claims: [] })
  }
}
