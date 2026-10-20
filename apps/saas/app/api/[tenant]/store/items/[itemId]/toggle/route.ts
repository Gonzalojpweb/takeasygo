/**
 * API Endpoint: Toggle Store Item (Admin)
 * 
 * PATCH  /api/{tenant}/store/items/{itemId}/toggle - Activar/desactivar item
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreItem from '@/models/StoreItem'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardSharedOrLocation } from '@/lib/location-scope'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, itemId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (permError) return permError

    // Solo ítems propios: los globales de la plataforma no se activan ni
    // desactivan desde un negocio (afectaría a todos).
    const item = await StoreItem.findOne({ _id: itemId, tenantId: tenant._id })
    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }
    const sedeError = await guardSharedOrLocation(request, item.locationId ?? null, 'Item no encontrado')
    if (sedeError) return sedeError

    item.isActive = !item.isActive
    await item.save()

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[Store Item Toggle PATCH] Error:', error)
    return NextResponse.json({ error: 'Error al togglear item' }, { status: 500 })
  }
}
