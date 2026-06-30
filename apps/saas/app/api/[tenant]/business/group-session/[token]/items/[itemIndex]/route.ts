import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string; itemIndex: string }> }
) {
  try {
    const { tenant: tenantSlug, token, itemIndex } = await params
    await connectDB()

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

    // Validate request comes from company admin
    const body = await request.json()
    const email = body?.email?.toLowerCase().trim()
    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const corpAccount = await CorporateAccount.findOne({
      _id: order.corporateAccountId,
      status: 'active',
    }).lean()

    if (!corpAccount || corpAccount.companyAdminEmail.toLowerCase() !== email) {
      return NextResponse.json({ error: 'Solo el mail de empresa puede eliminar items' }, { status: 403 })
    }

    const idx = parseInt(itemIndex, 10)
    if (isNaN(idx) || idx < 0 || idx >= (order.items as any[]).length) {
      return NextResponse.json({ error: 'Índice de item inválido' }, { status: 400 })
    }

    const items = order.items as any[]
    items.splice(idx, 1)
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
