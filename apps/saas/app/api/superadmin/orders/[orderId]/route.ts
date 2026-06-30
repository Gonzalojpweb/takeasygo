import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  try {
    const { orderId } = await params
    await connectDB()

    const order = await Order.findById(orderId)
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    await Order.deleteOne({ _id: orderId })

    return NextResponse.json({ success: true, hardDeleted: true })
  } catch (error) {
    console.error('[superadmin/orders/delete] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar la orden' }, { status: 500 })
  }
}

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  try {
    const { orderId } = await params
    await connectDB()

    const order = await Order.findById(orderId)
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    await Order.updateOne(
      { _id: orderId },
      { $unset: { deletedAt: '' } }
    )

    return NextResponse.json({ success: true, restored: true })
  } catch (error) {
    console.error('[superadmin/orders/restore] Error:', error)
    return NextResponse.json({ error: 'Error al restaurar la orden' }, { status: 500 })
  }
}
