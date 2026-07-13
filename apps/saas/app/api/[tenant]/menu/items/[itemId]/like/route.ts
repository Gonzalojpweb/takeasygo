import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import ItemLike from '@/models/ItemLike'
import { verifyRatingToken } from '@/lib/rating-token'
import { NextRequest, NextResponse } from 'next/server'

async function getTenantAndItem(tenantSlug: string, itemId: string) {
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) return null
  const menu = await Menu.findOne({ tenantId: tenant._id, isActive: true })
  if (!menu) return null
  const cat = menu.categories.find((c: any) =>
    c.items.some((i: any) => i._id.toString() === itemId)
  )
  if (!cat) return null
  const item = cat.items.id(itemId)
  if (!item) return null
  return { tenant, menu, item }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, itemId } = await params
    const { orderId, token } = await request.json()

    if (!orderId || !token) {
      return NextResponse.json({ error: 'orderId y token requeridos' }, { status: 400 })
    }

    if (!verifyRatingToken(orderId, token)) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const result = await getTenantAndItem(tenantSlug, itemId)
    if (!result) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }
    const { tenant, menu } = result

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const itemInOrder = order.items.some(
      (i: any) => i.menuItemId && i.menuItemId.toString() === itemId
    )
    if (!itemInOrder) {
      return NextResponse.json({ error: 'Item no está en este pedido' }, { status: 403 })
    }

    const existing = await ItemLike.findOne({ orderId, menuItemId: itemId })
    if (existing) {
      return NextResponse.json({ liked: true, likesCount: existing._id })
    }

    await ItemLike.create({ tenantId: tenant._id, menuItemId: itemId, orderId })

    const cat = menu.categories.find((c: any) =>
      c.items.some((i: any) => i._id.toString() === itemId)
    )
    const item = cat.items.id(itemId)
    item.likesCount = (item.likesCount || 0) + 1
    menu.markModified('categories')
    await menu.save()

    return NextResponse.json({ liked: true, likesCount: item.likesCount })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, itemId } = await params
    const { orderId, token } = await request.json()

    if (!orderId || !token) {
      return NextResponse.json({ error: 'orderId y token requeridos' }, { status: 400 })
    }

    if (!verifyRatingToken(orderId, token)) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const result = await getTenantAndItem(tenantSlug, itemId)
    if (!result) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }
    const { tenant, menu } = result

    const removed = await ItemLike.findOneAndDelete({ orderId, menuItemId: itemId })
    if (!removed) {
      return NextResponse.json({ liked: false, likesCount: 0 })
    }

    const cat = menu.categories.find((c: any) =>
      c.items.some((i: any) => i._id.toString() === itemId)
    )
    const item = cat.items.id(itemId)
    item.likesCount = Math.max(0, (item.likesCount || 0) - 1)
    menu.markModified('categories')
    await menu.save()

    return NextResponse.json({ liked: false, likesCount: item.likesCount })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, itemId } = await params
    const orderId = request.nextUrl.searchParams.get('orderId')
    const token = request.nextUrl.searchParams.get('token')

    const result = await getTenantAndItem(tenantSlug, itemId)
    if (!result) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }
    const { item } = result

    let liked = false
    if (orderId && token && verifyRatingToken(orderId, token)) {
      const existing = await ItemLike.findOne({ orderId, menuItemId: itemId })
      liked = !!existing
    }

    return NextResponse.json({ liked, likesCount: item.likesCount || 0 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
