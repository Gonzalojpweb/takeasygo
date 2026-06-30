import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const { searchParams } = request.nextUrl
    const tenantId = searchParams.get('tenantId')

    if (!tenantId) {
      return NextResponse.json({ error: 'Se requiere tenantId' }, { status: 400 })
    }

    const tenant = await Tenant.findById(tenantId).select(
      'name slug loyalty pointsConfig store promotionLabels loyaltyMessaging'
    ).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ config: tenant })
  } catch (error) {
    console.error('[superadmin/club/config GET]', error)
    return NextResponse.json({ error: 'Error al obtener configuración del club' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json()
    const { tenantId, loyalty, pointsConfig, store, promotionLabels, loyaltyMessaging } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Se requiere tenantId' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (loyalty) {
      if (loyalty.clubName !== undefined) tenant.loyalty.clubName = loyalty.clubName
      if (loyalty.welcomeMessage !== undefined) tenant.loyalty.welcomeMessage = loyalty.welcomeMessage
      if (loyalty.enabled !== undefined) tenant.loyalty.enabled = loyalty.enabled
      if (loyalty.sosLimit !== undefined) tenant.loyalty.sosLimit = loyalty.sosLimit
      if (loyalty.sosMaxLimit !== undefined) tenant.loyalty.sosMaxLimit = loyalty.sosMaxLimit
    }

    if (pointsConfig) {
      if (pointsConfig.enabled !== undefined) tenant.pointsConfig.enabled = pointsConfig.enabled
      if (pointsConfig.mode !== undefined) tenant.pointsConfig.mode = pointsConfig.mode
      if (pointsConfig.pointsPerCurrency !== undefined) tenant.pointsConfig.pointsPerCurrency = pointsConfig.pointsPerCurrency
      if (pointsConfig.pointsPercentage !== undefined) tenant.pointsConfig.pointsPercentage = pointsConfig.pointsPercentage
      if (pointsConfig.pointsPerOrder !== undefined) tenant.pointsConfig.pointsPerOrder = pointsConfig.pointsPerOrder
      if (pointsConfig.minOrderForPoints !== undefined) tenant.pointsConfig.minOrderForPoints = pointsConfig.minOrderForPoints
      if (pointsConfig.pointsRedemptionValue !== undefined) tenant.pointsConfig.pointsRedemptionValue = pointsConfig.pointsRedemptionValue
      if (pointsConfig.redemptionEnabled !== undefined) tenant.pointsConfig.redemptionEnabled = pointsConfig.redemptionEnabled
      if (pointsConfig.welcomePoints !== undefined) tenant.pointsConfig.welcomePoints = pointsConfig.welcomePoints
    }

    if (store) {
      if (store.enabled !== undefined) tenant.store.enabled = store.enabled
      if (store.title !== undefined) tenant.store.title = store.title
      if (store.description !== undefined) tenant.store.description = store.description
      if (store.allowOnlineRedemption !== undefined) tenant.store.allowOnlineRedemption = store.allowOnlineRedemption
      if (store.redemptionExpiryHours !== undefined) tenant.store.redemptionExpiryHours = store.redemptionExpiryHours
      if (store.enableCheckoutRedemption !== undefined) tenant.store.enableCheckoutRedemption = store.enableCheckoutRedemption
    }

    if (promotionLabels) {
      if (promotionLabels.sale !== undefined) tenant.promotionLabels.sale = promotionLabels.sale
      if (promotionLabels.info !== undefined) tenant.promotionLabels.info = promotionLabels.info
      if (promotionLabels.announcement !== undefined) tenant.promotionLabels.announcement = promotionLabels.announcement
      if (promotionLabels.loyalty !== undefined) tenant.promotionLabels.loyalty = promotionLabels.loyalty
    }

    if (loyaltyMessaging) {
      if (loyaltyMessaging.modalSubtitle !== undefined) tenant.loyaltyMessaging.modalSubtitle = loyaltyMessaging.modalSubtitle
      if (loyaltyMessaging.successTitle !== undefined) tenant.loyaltyMessaging.successTitle = loyaltyMessaging.successTitle
      if (loyaltyMessaging.successMessage !== undefined) tenant.loyaltyMessaging.successMessage = loyaltyMessaging.successMessage
      if (loyaltyMessaging.welcomePointsMsg !== undefined) tenant.loyaltyMessaging.welcomePointsMsg = loyaltyMessaging.welcomePointsMsg
    }

    await tenant.save()

    logAudit({
      tenantId: tenantId,
      action: 'club.config.updated',
      entity: 'tenant',
      details: { tenantId, updatedFields: Object.keys(body) },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[superadmin/club/config PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar configuración del club' }, { status: 500 })
  }
}
