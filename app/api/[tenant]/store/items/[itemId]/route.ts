/**
 * API Endpoint: Store Item Detail (Admin)
 * 
 * GET    /api/{tenant}/store/items/{itemId}     - Ver item
 * PUT    /api/{tenant}/store/items/{itemId}     - Actualizar item
 * DELETE /api/{tenant}/store/items/{itemId}     - Eliminar item
 * PATCH  /api/{tenant}/store/items/{itemId}/toggle - Activar/desactivar
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreItem from '@/models/StoreItem'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
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

    const item = await StoreItem.findOne({ _id: itemId, tenantId: tenant._id }).lean()
    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[Store Item GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener item' }, { status: 500 })
  }
}

export async function PUT(
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

    const body = await request.json()
    const item = await StoreItem.findOneAndUpdate(
      { _id: itemId, tenantId: tenant._id },
      { $set: body },
      { new: true }
    )

    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[Store Item PUT] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar item' }, { status: 500 })
  }
}

export async function DELETE(
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

    const item = await StoreItem.findOneAndDelete({ _id: itemId, tenantId: tenant._id })
    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Store Item DELETE] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar item' }, { status: 500 })
  }
}
