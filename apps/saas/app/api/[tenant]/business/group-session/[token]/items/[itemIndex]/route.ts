import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { requireCorpAccess } from '@/lib/corpAuth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string; itemIndex: string }> }
) {
  try {
    const { tenant: tenantSlug, token, itemIndex } = await params
    await connectDB()

    const authz = await requireCorpAccess(request, tenantSlug, { requireRole: 'admin' })
    if (!authz.ok) return authz.response

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({
      tenantId: tenant._id,
      groupSessionToken: token,
      status: 'open',
    })
    if (!order) {
      return NextResponse.json({ error: 'Sesión grupal no encontrada o ya cerrada' }, { status: 404 })
    }

    if (String(order.corporateAccountId) !== String(authz.access.account._id)) {
      return NextResponse.json({ error: 'Solo el mail de empresa puede eliminar items' }, { status: 403 })
    }

    // itemIndex is now the item's _id (ObjectId string), not a numeric position
    if (!mongoose.Types.ObjectId.isValid(itemIndex)) {
      return NextResponse.json({ error: 'ID de item inválido' }, { status: 400 })
    }

    const items = order.items as any[]
    const itemIdx = items.findIndex((i: any) => i._id?.toString() === itemIndex)
    if (itemIdx === -1) {
      return NextResponse.json({ error: 'Item no encontrado en la sesión' }, { status: 404 })
    }

    items.splice(itemIdx, 1)
    order.items = items
    order.subtotal = items.reduce((sum: number, i: any) => sum + i.subtotal, 0)
    order.total = order.subtotal
    await order.save()

    return NextResponse.json({
      session: {
        items: order.items,
        subtotal: order.subtotal,
        total: order.total,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
