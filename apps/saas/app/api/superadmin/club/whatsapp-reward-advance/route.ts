/**
 * Superadmin WhatsApp Reward Advance
 *
 * GET  /api/superadmin/club/whatsapp-reward-advance?action=list-tenants
 *      → Lista tenants elegibles (plan buy/full + tgoGrowthPushEnabled + sosLimit > 0)
 *
 * GET  /api/superadmin/club/whatsapp-reward-advance?action=list-members&tenantSlug=xxx
 *      → Miembros elegibles de un tenant específico
 *
 * PUT  /api/superadmin/club/whatsapp-reward-advance
 *      → Marcar intento de contacto (re-valida plan + toggle)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import Location from '@/models/Location'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

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

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const { searchParams } = request.nextUrl
    const action = searchParams.get('action')

    if (action === 'list-tenants') {
      // Tenants con plan Crecimiento/Premium + tgoGrowthPushEnabled + sosLimit > 0
      const tenants = await Tenant.find({
        isActive: true,
        plan: { $in: ['buy', 'full'] },
        'features.tgoGrowthPushEnabled': true,
      })
        .select('name slug plan loyalty.sosLimit loyalty.clubName')
        .lean()

      // Filtrar los que tienen sosLimit > 0
      const eligible = tenants.filter(
        (t: any) => (t.loyalty?.sosLimit ?? 0) > 0
      )

      return NextResponse.json({
        tenants: eligible.map((t: any) => ({
          tenantId: t._id.toString(),
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          clubName: t.loyalty?.clubName || `Club ${t.name}`,
          sosLimit: t.loyalty?.sosLimit ?? 0,
        })),
      })
    }

    if (action === 'list-members') {
      const tenantSlug = searchParams.get('tenantSlug')
      if (!tenantSlug) {
        return NextResponse.json({ error: 'Falta tenantSlug' }, { status: 400 })
      }

      const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
        .select('_id plan features.tgoGrowthPushEnabled loyalty name')
        .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; features: any; loyalty: any; name: string }>()

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
      }

      if (!canAccess(tenant.plan, 'loyaltyClub')) {
        return NextResponse.json({ error: 'Plan no soporta club' }, { status: 403 })
      }

      if (!tenant.features?.tgoGrowthPushEnabled) {
        return NextResponse.json({ error: 'Push de TGO desactivado para este tenant' }, { status: 403 })
      }

      const tenantId = tenant._id
      const sosLimit = tenant.loyalty?.sosLimit ?? 0
      const clubName = tenant.loyalty?.clubName || `Club ${tenant.name}`

      // Obtener locationId default para el link al menú (solo para construir URL, NO se persiste)
      const defaultLocation = await Location.findOne({ tenantId, isActive: true })
        .select('_id')
        .lean<{ _id: mongoose.Types.ObjectId }>()
      const menuBasePath = defaultLocation
        ? `/${tenantSlug}/menu/${defaultLocation._id.toString()}`
        : ''

      const storeItems = await StoreItem.find({
        tenantId,
        isActive: true,
        $or: [{ scope: 'tenant' }, { scope: { $exists: false } }],
      })
        .select('name pointsCost')
        .lean()

      if (sosLimit <= 0 || storeItems.length === 0) {
        return NextResponse.json({ sosLimit, clubName, menuBasePath, members: [] })
      }

      const members = await LoyaltyMember.find({
        tenantId,
        status: 'active',
        phone: { $ne: '' },
      })
        .select('name phone loyalty.points sosConfig.hasPendingSos lastRewardAdvanceAttemptedAt')
        .lean()

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
          const eligibleItems = storeItems
            .filter((item) => points < item.pointsCost && points + sosLimit >= item.pointsCost)
            .sort((a, b) => a.pointsCost - b.pointsCost)
            .slice(0, 3)

          return {
            _id: m._id,
            name: m.name,
            phone: m.phone,
            points,
            lastAttemptedAt: m.lastRewardAdvanceAttemptedAt || null,
            eligibleItems,
          }
        })
        .sort((a, b) => (a.lastAttemptedAt ? 1 : 0) - (b.lastAttemptedAt ? 1 : 0))

      return NextResponse.json({ sosLimit, clubName, menuBasePath, members: eligible })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (error) {
    console.error('[superadmin/whatsapp-reward-advance GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const body = await request.json()
    const { memberId, tenantSlug } = body

    if (!memberId || !tenantSlug) {
      return NextResponse.json({ error: 'Falta memberId o tenantSlug' }, { status: 400 })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan features.tgoGrowthPushEnabled loyalty')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; features: any; loyalty: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Re-validar plan
    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Plan no soporta club' }, { status: 403 })
    }

    // Re-validar toggle (alguien podría haberlo desactivado mientras el superadmin tenía la lista cargada)
    if (!tenant.features?.tgoGrowthPushEnabled) {
      return NextResponse.json({ ok: false, reason: 'Push de TGO desactivado para este tenant' }, { status: 403 })
    }

    const tenantId = tenant._id
    const sosLimit = tenant.loyalty?.sosLimit ?? 0

    if (sosLimit <= 0) {
      return NextResponse.json({ ok: false, reason: 'Tenant sin SOS configurado' }, { status: 400 })
    }

    // Re-verificar elegibilidad
    const oid = mongoose.Types.ObjectId.isValid(memberId) ? new mongoose.Types.ObjectId(memberId) : memberId
    const member = await LoyaltyMember.findOne({ _id: oid, tenantId })
      .select('name phone status loyalty.points sosConfig hasPendingSos')
      .lean()

    if (!member) {
      return NextResponse.json({ ok: false, reason: 'Miembro no encontrado' }, { status: 404 })
    }

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
      { _id: oid, tenantId },
      { $set: { lastRewardAdvanceAttemptedAt: now, lastRewardAdvanceAttemptedBy: 'superadmin' } }
    )

    return NextResponse.json({ ok: true, lastAttemptedAt: now })
  } catch (error) {
    console.error('[superadmin/whatsapp-reward-advance PUT]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
