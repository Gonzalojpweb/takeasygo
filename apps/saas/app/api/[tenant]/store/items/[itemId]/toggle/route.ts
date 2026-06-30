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

    const item = await StoreItem.findOne({
      _id: itemId,
      $or: [
        { tenantId: tenant._id },
        { scope: 'global', $or: [{ targetTenants: tenant._id }, { targetTenants: { $size: 0 } }] },
      ],
    })
    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    item.isActive = !item.isActive
    await item.save()

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[Store Item Toggle PATCH] Error:', error)
    return NextResponse.json({ error: 'Error al togglear item' }, { status: 500 })
  }
}
