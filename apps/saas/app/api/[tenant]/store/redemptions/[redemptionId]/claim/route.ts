/**
 * API Endpoint: Claim Store Redemption (Admin/Staff)
 * 
 * PATCH  /api/{tenant}/store/redemptions/{redemptionId}/claim - Reclamar canje (validar código)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreRedemption from '@/models/StoreRedemption'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import Location from '@/models/Location'

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
    const authError = await requireAuth(request, tenant._id.toString())
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
      await StoreRedemption.updateOne(
        { _id: redemptionId },
        { status: 'expired' }
      )
      return NextResponse.json({ error: 'Redención expirada' }, { status: 400 })
    }

    // Validar locationId si se proporciona
    if (locationId) {
      const location = await Location.findOne({ _id: locationId, tenantId: tenant._id })
      if (!location) {
        return NextResponse.json({ error: 'Locación no encontrada' }, { status: 404 })
      }
    }

    // Actualizar redención
    await StoreRedemption.updateOne(
      { _id: redemptionId },
      {
        status: 'claimed',
        locationId: locationId || null,
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
