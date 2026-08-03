/**
 * API Endpoint: Store Config (Admin)
 * 
 * GET    /api/{tenant}/store/config              - Ver configuración
 * PUT    /api/{tenant}/store/config              - Actualizar configuración
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Solo tenants Premium tienen acceso a la Store
    if (!canAccess(tenant.plan, 'store')) {
      return NextResponse.json({
        config: {
          enabled: false,
          title: 'Tienda de Recompensas',
          description: 'Canjea tus puntos por recompensas exclusivas',
          heroImageUrl: '',
          allowOnlineRedemption: false,
          enableCheckoutRedemption: false,
          redemptionExpiryHours: 24,
        }
      })
    }

    // Acceso público: devuelve config sin requerir auth (StoreView lo necesita)
    // Para modificar la config se requiere auth (endpoint PUT)
    return NextResponse.json({ 
      config: tenant.store || {
        enabled: false,
        title: 'Tienda de Recompensas',
        description: 'Canjea tus puntos por recompensas exclusivas',
        heroImageUrl: '',
        allowOnlineRedemption: false,
        enableCheckoutRedemption: false,
        redemptionExpiryHours: 24,
      }
    })
  } catch (error) {
    console.error('[Store Config GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
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
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const {
      enabled,
      title,
      description,
      heroImageUrl,
      allowOnlineRedemption,
      enableCheckoutRedemption,
      redemptionExpiryHours,
      locationId,
    } = body

    const updateData: any = {}
    if (enabled !== undefined) updateData['store.enabled'] = enabled
    if (title !== undefined) updateData['store.title'] = title
    if (description !== undefined) updateData['store.description'] = description
    if (heroImageUrl !== undefined) updateData['store.heroImageUrl'] = heroImageUrl
    if (allowOnlineRedemption !== undefined) updateData['store.allowOnlineRedemption'] = allowOnlineRedemption
    if (enableCheckoutRedemption !== undefined) updateData['store.enableCheckoutRedemption'] = enableCheckoutRedemption
    if (redemptionExpiryHours !== undefined) updateData['store.redemptionExpiryHours'] = redemptionExpiryHours
    if (locationId !== undefined) updateData['store.locationId'] = locationId

    const updatedTenant = await Tenant.findOneAndUpdate(
      { _id: tenant._id },
      { $set: updateData },
      { new: true }
    )

    if (!updatedTenant) {
      return NextResponse.json({ error: 'Error al actualizar configuración' }, { status: 500 })
    }

    return NextResponse.json({ 
      config: updatedTenant.store 
    })
  } catch (error) {
    console.error('[Store Config PUT] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar configuración' }, { status: 500 })
  }
}
