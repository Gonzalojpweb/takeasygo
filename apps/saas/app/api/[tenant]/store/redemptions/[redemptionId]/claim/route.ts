/**
 * API Endpoint: Claim Store Redemption (Admin/Staff)
 * 
 * PATCH  /api/{tenant}/store/redemptions/{redemptionId}/claim - Reclamar canje (validar código)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreRedemption from '@/models/StoreRedemption'
import Tenant from '@/models/Tenant'
import { requireTenantRole, FLOOR_ROLES } from '@/lib/apiAuth'
import { guardRequestLocation, scopedLocationIds } from '@/lib/location-scope'
import Location from '@/models/Location'
import { expireStoreRedemption } from '@/lib/store-redemptions'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; redemptionId: string }> }
) {
  try {
    const { tenant: tenantSlug, redemptionId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Requiere autenticación de staff/admin
    const authError = await requireTenantRole(request, tenant._id.toString(), FLOOR_ROLES)
    if (authError) return authError

    const body = await request.json()
    const { locationId, redemptionCode } = body

    // Buscar redención
    const redemption = await StoreRedemption.findOne({ 
      _id: redemptionId, 
      tenantId: tenant._id 
    }).populate('memberId').populate('storeItemId')

    if (!redemption) {
      return NextResponse.json({ error: 'Redención no encontrada' }, { status: 404 })
    }

    // Validar código si se proporciona
    if (redemptionCode && redemptionCode !== redemption.redemptionCode) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    }

    // Validar estado
    if (redemption.status !== 'pending') {
      return NextResponse.json({ 
        error: 'Redención ya procesada',
        status: redemption.status 
      }, { status: 400 })
    }

    // Validar expiración
    if (redemption.expiresAt && new Date() > redemption.expiresAt) {
      // Expiración detectada al reclamar: usa el MISMO flip condicional que
      // el cron (gana solo uno), así los puntos se devuelven una sola vez.
      // Aunque falle, el canje vencido igualmente no se reclama.
      try {
        await expireStoreRedemption(redemption)
      } catch (err) {
        console.error('[Store Redemption Claim] Error expirando canje vencido:', err)
      }
      return NextResponse.json({ error: 'Redención expirada' }, { status: 400 })
    }

    // Sede de entrega: un usuario de sede entrega en una de sus sedes (si
    // tiene una sola, se usa esa). Un canje ya asociado a otra sede no se
    // entrega fuera de ella.
    const scoped = await scopedLocationIds(request)
    let claimLocationId: string | null = locationId || null
    if (scoped && !claimLocationId && scoped.length === 1) claimLocationId = scoped[0]
    if (scoped && !claimLocationId) {
      return NextResponse.json({ error: 'Indicá la sede donde se entrega el canje' }, { status: 400 })
    }
    const ownSedeError = await guardRequestLocation(request, redemption.locationId, 'Redención no encontrada')
    if (ownSedeError) return ownSedeError

    // Validar locationId si se proporciona
    if (claimLocationId) {
      const location = await Location.findOne({ _id: claimLocationId, tenantId: tenant._id })
      if (!location) {
        return NextResponse.json({ error: 'Locación no encontrada' }, { status: 404 })
      }
      const sedeError = await guardRequestLocation(request, claimLocationId, 'Locación no encontrada')
      if (sedeError) return sedeError
    }

    // Actualizar redención
    await StoreRedemption.updateOne(
      { _id: redemptionId },
      {
        status: 'claimed',
        locationId: claimLocationId,
        claimedAt: new Date(),
      }
    )

    return NextResponse.json({
      success: true,
      redemption: {
        id: redemption._id,
        memberName: (redemption.memberId as any).name,
        itemName: (redemption.storeItemId as any).name,
        pointsUsed: redemption.pointsUsed,
        claimedAt: new Date(),
      }
    })

  } catch (error) {
    console.error('[Store Redemption Claim PATCH] Error:', error)
    return NextResponse.json({ error: 'Error al reclamar redención' }, { status: 500 })
  }
}
