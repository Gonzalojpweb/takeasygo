/**
 * API Endpoint: WhatsApp Reward Advance
 *
 * GET  /api/{tenant}/club/whatsapp-reward-advance  - Listar miembros elegibles
 * PUT  /api/{tenant}/club/whatsapp-reward-advance  - Marcar intento de contacto
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

/** Re-verifica elegibilidad de un miembro (mismos filtros que GET) */
async function isEligible(
  member: any,
  sosLimit: number,
  storeItems: any[]
): Promise<boolean> {
  if (member.status !== 'active') return false
  if (!member.phone || member.phone.trim() === '') return false
  if (member.sosConfig?.hasPendingSos) return false
  if (sosLimit <= 0) return false

  const points = member.loyalty?.points ?? 0
  return storeItems.some(
    (item) => points < item.pointsCost && points + sosLimit >= item.pointsCost
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty name')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any; name: string }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Plan no soporta club de fidelización' }, { status: 403 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const tenantId = tenant._id
    const sosLimit = tenant.loyalty?.sosLimit ?? 0
    const clubName = tenant.loyalty?.clubName || `Club ${tenant.name}`

    // Traer items activos de la tienda
    const storeItems = await StoreItem.find({
      tenantId,
      isActive: true,
      $or: [{ scope: 'tenant' }, { scope: { $exists: false } }],
    })
      .select('name pointsCost')
      .lean()

    if (sosLimit <= 0 || storeItems.length === 0) {
      return NextResponse.json({ sosLimit, clubName, members: [] })
    }

    // Traer miembros activos con teléfono
    const members = await LoyaltyMember.find({
      tenantId,
      status: 'active',
      phone: { $ne: '' },
    })
      .select('name phone loyalty.points sosConfig.hasPendingSos lastRewardAdvanceAttemptedAt')
      .lean()

    // Filtrar elegibles
    const eligible = members
      .filter((m) => {
        if (m.sosConfig?.hasPendingSos) return false
        if (!m.phone || m.phone.trim() === '') return false
        const points = m.loyalty?.points ?? 0
        return storeItems.some(
          (item) => points < item.pointsCost && points + sosLimit >= item.pointsCost
        )
      })
      .map((m) => {
        const points = m.loyalty?.points ?? 0
        // Items que el miembro puede canjear SOLO con SOS (no los que ya puede sin SOS)
        const eligibleItems = storeItems
          .filter((item) => points < item.pointsCost && points + sosLimit >= item.pointsCost)
          .sort((a, b) => a.pointsCost - b.pointsCost)
          .slice(0, 3) // Cap de 3 items en el mensaje

        return {
          _id: m._id,
          name: m.name,
          phone: m.phone,
          points,
          lastAttemptedAt: m.lastRewardAdvanceAttemptedAt || null,
          eligibleItems,
        }
      })
      .sort((a, b) => (a.lastAttemptedAt ? 1 : 0) - (b.lastAttemptedAt ? 1 : 0)) // Nunca contactados primero

    return NextResponse.json({ sosLimit, clubName, members: eligible })
  } catch (error) {
    console.error('[whatsapp-reward-advance GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Plan no soporta club de fidelización' }, { status: 403 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { memberId } = body

    if (!memberId) {
      return NextResponse.json({ error: 'Falta memberId' }, { status: 400 })
    }

    const tenantId = tenant._id
    const sosLimit = tenant.loyalty?.sosLimit ?? 0

    if (sosLimit <= 0) {
      return NextResponse.json({ ok: false, reason: 'Tenant sin SOS configurado' }, { status: 400 })
    }

    // Re-verificar elegibilidad antes de marcar
    const member = await LoyaltyMember.findOne({ _id: memberId, tenantId })
      .select('name phone status loyalty.points sosConfig hasPendingSos')
      .lean()

    if (!member) {
      return NextResponse.json({ ok: false, reason: 'Miembro no encontrado' }, { status: 404 })
    }

    // Traer items activos para re-verificar
    const storeItems = await StoreItem.find({
      tenantId,
      isActive: true,
      $or: [{ scope: 'tenant' }, { scope: { $exists: false } }],
    })
      .select('pointsCost')
      .lean()

    const eligible = await isEligible(member, sosLimit, storeItems)

    if (!eligible) {
      return NextResponse.json({ ok: false, reason: 'Ya no es elegible' })
    }

    // Marcar intento
    const now = new Date()
    await LoyaltyMember.updateOne(
      { _id: memberId, tenantId },
      { $set: { lastRewardAdvanceAttemptedAt: now, lastRewardAdvanceAttemptedBy: 'admin' } }
    )

    return NextResponse.json({ ok: true, lastAttemptedAt: now })
  } catch (error) {
    console.error('[whatsapp-reward-advance PUT]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
