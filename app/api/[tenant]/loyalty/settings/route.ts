import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import { logAudit } from '@/lib/audit'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'
import PlatformConfig from '@/models/PlatformConfig'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty name wallet branding pointsConfig')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any; name: string; wallet: any; branding: any; pointsConfig: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // GET público sin auth — usado por checkout para mostrar checkbox de registro
    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({
        loyalty: { enabled: false },
        plan: tenant.plan,
      })
    }

    // Obtener el globalSosLimit para que el slider sepa su tope
    const platformConfig = await PlatformConfig.findById('platform').lean() as any
    const globalSosLimit = platformConfig?.sosConfig?.globalSosLimit ?? 250

    return NextResponse.json({
      loyalty: tenant.loyalty ?? {
        enabled:        false,
        clubName:       `Club ${tenant.name}`,
        welcomeMessage: '',
        createdAt:      null,
        sosLimit:       0,
      },
      globalSosLimit,
      wallet: tenant.wallet ?? {
        enabled: false,
        cardColor: tenant.branding?.primaryColor || '#000000',
        labelColor: tenant.branding?.textColor || '#FFFFFF',
        logoUrl: tenant.branding?.logoUrl || '',
      },
      pointsConfig: tenant.pointsConfig ?? {
        enabled: false,
        mode: 'fixed_per_currency',
        pointsPerCurrency: 0.1,
        pointsPercentage: 10,
        pointsPerOrder: 0,
        minOrderForPoints: 0,
        pointsRedemptionValue: 10,
        redemptionEnabled: true,
      },
      plan: tenant.plan,
    })
  } catch (error) {
    console.error('[loyalty/settings GET]', error)
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
      .select('_id plan loyalty name wallet branding pointsConfig')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any; name: string; wallet: any; branding: any; pointsConfig: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    // Obtener globalSosLimit para validar el cap
    const platformConfig = await PlatformConfig.findById('platform').lean() as any
    const globalSosLimit = platformConfig?.sosConfig?.globalSosLimit ?? 250

    const body = await request.json()
    const { enabled, clubName, welcomeMessage, wallet, pointsConfig, sosLimit } = body

    const update: Record<string, any> = {}
    const changes: Record<string, { from: any; to: any }> = {}

    if (typeof enabled === 'boolean') {
      const wasEnabled = tenant.loyalty?.enabled ?? false
      update['loyalty.enabled'] = enabled
      changes.enabled = { from: wasEnabled, to: enabled }

      if (enabled && !wasEnabled) {
        update['loyalty.createdAt'] = new Date()
      }
    }

    if (clubName !== undefined) {
      const cleanName = String(clubName).trim().slice(0, 80)
      if (cleanName !== (tenant.loyalty?.clubName ?? '')) {
        update['loyalty.clubName'] = cleanName || `Club ${tenant.name}`
        changes.clubName = { from: tenant.loyalty?.clubName, to: cleanName }
      }
    }

    if (welcomeMessage !== undefined) {
      const cleanMsg = String(welcomeMessage).trim().slice(0, 300)
      if (cleanMsg !== (tenant.loyalty?.welcomeMessage ?? '')) {
        update['loyalty.welcomeMessage'] = cleanMsg
        changes.welcomeMessage = { from: tenant.loyalty?.welcomeMessage, to: cleanMsg }
      }
    }

    // SOS limit (capped by globalSosLimit)
    if (sosLimit !== undefined) {
      const parsedLimit = Math.max(0, Math.min(parseInt(sosLimit) || 0, globalSosLimit))
      const currentLimit = tenant.loyalty?.sosLimit ?? 0
      if (parsedLimit !== currentLimit) {
        update['loyalty.sosLimit'] = parsedLimit
        changes.sosLimit = { from: currentLimit, to: parsedLimit }
      }
    }

    // Wallet settings
    if (wallet) {
      if (typeof wallet.enabled === 'boolean') {
        const wasWalletEnabled = tenant.wallet?.enabled ?? false
        update['wallet.enabled'] = wallet.enabled
        changes['wallet.enabled'] = { from: wasWalletEnabled, to: wallet.enabled }
      }

      if (wallet.cardColor !== undefined) {
        update['wallet.cardColor'] = String(wallet.cardColor).trim()
        changes['wallet.cardColor'] = { from: tenant.wallet?.cardColor, to: wallet.cardColor }
      }

      if (wallet.labelColor !== undefined) {
        update['wallet.labelColor'] = String(wallet.labelColor).trim()
        changes['wallet.labelColor'] = { from: tenant.wallet?.labelColor, to: wallet.labelColor }
      }

      if (wallet.logoUrl !== undefined) {
        update['wallet.logoUrl'] = String(wallet.logoUrl).trim()
        changes['wallet.logoUrl'] = { from: tenant.wallet?.logoUrl, to: wallet.logoUrl }
      }
      if (wallet.geofenceRadius !== undefined) {
        update['wallet.geofenceRadius'] = Number(wallet.geofenceRadius)
        changes['wallet.geofenceRadius'] = { from: tenant.wallet?.geofenceRadius, to: wallet.geofenceRadius }
      }
      if (wallet.geofenceMessage !== undefined) {
        update['wallet.geofenceMessage'] = String(wallet.geofenceMessage).trim()
        changes['wallet.geofenceMessage'] = { from: tenant.wallet?.geofenceMessage, to: wallet.geofenceMessage }
      }
    }

    // Points config settings
    if (pointsConfig) {
      if (typeof pointsConfig.enabled === 'boolean') {
        const wasEnabled = tenant.pointsConfig?.enabled ?? false
        update['pointsConfig.enabled'] = pointsConfig.enabled
        changes['pointsConfig.enabled'] = { from: wasEnabled, to: pointsConfig.enabled }
      }

      if (pointsConfig.mode !== undefined) {
        update['pointsConfig.mode'] = pointsConfig.mode
        changes['pointsConfig.mode'] = { from: tenant.pointsConfig?.mode, to: pointsConfig.mode }
      }

      if (pointsConfig.pointsPerCurrency !== undefined) {
        update['pointsConfig.pointsPerCurrency'] = parseFloat(pointsConfig.pointsPerCurrency)
        changes['pointsConfig.pointsPerCurrency'] = { from: tenant.pointsConfig?.pointsPerCurrency, to: pointsConfig.pointsPerCurrency }
      }

      if (pointsConfig.pointsPercentage !== undefined) {
        update['pointsConfig.pointsPercentage'] = parseFloat(pointsConfig.pointsPercentage)
        changes['pointsConfig.pointsPercentage'] = { from: tenant.pointsConfig?.pointsPercentage, to: pointsConfig.pointsPercentage }
      }

      if (pointsConfig.pointsPerOrder !== undefined) {
        update['pointsConfig.pointsPerOrder'] = parseInt(pointsConfig.pointsPerOrder)
        changes['pointsConfig.pointsPerOrder'] = { from: tenant.pointsConfig?.pointsPerOrder, to: pointsConfig.pointsPerOrder }
      }

      if (pointsConfig.minOrderForPoints !== undefined) {
        update['pointsConfig.minOrderForPoints'] = parseFloat(pointsConfig.minOrderForPoints)
        changes['pointsConfig.minOrderForPoints'] = { from: tenant.pointsConfig?.minOrderForPoints, to: pointsConfig.minOrderForPoints }
      }

      if (pointsConfig.pointsRedemptionValue !== undefined) {
        update['pointsConfig.pointsRedemptionValue'] = parseInt(pointsConfig.pointsRedemptionValue)
        changes['pointsConfig.pointsRedemptionValue'] = { from: tenant.pointsConfig?.pointsRedemptionValue, to: pointsConfig.pointsRedemptionValue }
      }

      if (pointsConfig.redemptionEnabled !== undefined) {
        update['pointsConfig.redemptionEnabled'] = pointsConfig.redemptionEnabled === true || pointsConfig.redemptionEnabled === 'true'
        changes['pointsConfig.redemptionEnabled'] = { from: tenant.pointsConfig?.redemptionEnabled, to: update['pointsConfig.redemptionEnabled'] }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ loyalty: tenant.loyalty }, { status: 200 })
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $set: update },
      { new: true }
    ).select('loyalty wallet pointsConfig').lean()

    logAudit({
      tenantId: tenant._id.toString(),
      action:   'loyalty.settings.updated',
      entity:   'tenant',
      entityId: tenant._id.toString(),
      details:  changes,
      request,
    })

    return NextResponse.json({ 
      loyalty: updated?.loyalty,
      wallet: updated?.wallet,
      pointsConfig: updated?.pointsConfig
    })
  } catch (error) {
    console.error('[loyalty/settings PUT]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
