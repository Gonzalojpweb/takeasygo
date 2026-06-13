import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import StoreItem from '@/models/StoreItem'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const item = await StoreItem.findOne({ _id: id, scope: 'global' }).lean()
    if (!item) {
      return NextResponse.json({ error: 'Oferta global no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[superadmin/store-items/[id] GET]', error)
    return NextResponse.json({ error: 'Error al obtener la oferta' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    const body = await request.json()
    await connectDB()

    const item = await StoreItem.findOne({ _id: id, scope: 'global' })
    if (!item) {
      return NextResponse.json({ error: 'Oferta global no encontrada' }, { status: 404 })
    }

    if (body.name !== undefined) item.name = body.name.trim()
    if (body.description !== undefined) item.description = body.description.trim()
    if (body.imageUrl !== undefined) item.imageUrl = body.imageUrl.trim()
    if (body.pointsCost !== undefined) item.pointsCost = body.pointsCost
    if (body.cashValue !== undefined) item.cashValue = body.cashValue
    if (body.isActive !== undefined) item.isActive = body.isActive
    if (body.stock !== undefined) item.stock = body.stock
    if (body.maxPerMember !== undefined) item.maxPerMember = body.maxPerMember
    if (body.tierRequirement !== undefined) item.tierRequirement = body.tierRequirement
    if (body.category !== undefined) item.category = body.category
    if (body.tags !== undefined) item.tags = body.tags
    if (body.sortOrder !== undefined) item.sortOrder = body.sortOrder
    if (body.isFeatured !== undefined) item.isFeatured = body.isFeatured
    if (body.targetTenants !== undefined) item.targetTenants = body.targetTenants

    await item.save()

    logAudit({
      tenantId: null,
      action: 'store-item.global.updated',
      entity: 'storeitem',
      details: { itemId: item._id, name: item.name },
      request,
    })

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[superadmin/store-items/[id] PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar la oferta' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const deleted = await StoreItem.findOneAndDelete({ _id: id, scope: 'global' })
    if (!deleted) {
      return NextResponse.json({ error: 'Oferta global no encontrada' }, { status: 404 })
    }

    logAudit({
      tenantId: null,
      action: 'store-item.global.deleted',
      entity: 'storeitem',
      details: { itemId: id, name: deleted.name },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[superadmin/store-items/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar la oferta' }, { status: 500 })
  }
}
