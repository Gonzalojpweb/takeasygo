import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import DeliveryPerson from '@/models/DeliveryPerson'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function getDeliveryPersonId(request: NextRequest): string | null {
  const token = request.headers.get('x-delivery-token')
  if (!token) return null
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  return hash
}

export async function GET(
  request: NextRequest,
) {
  try {
    await connectDB()

    const tokenHash = getDeliveryPersonId(request)
    if (!tokenHash) {
      return NextResponse.json({ error: 'Token no proporcionado' }, { status: 401 })
    }

    const person = await DeliveryPerson.findOne({ tokenHash, isActive: true }).lean()
    if (!person) {
      return NextResponse.json({ error: 'Delivery no encontrado o desactivado' }, { status: 404 })
    }

    const [availableOrders, activeOrders, completedOrders] = await Promise.all([
      // Pedidos listos para tomar (no asignados a nadie)
      Order.find({
        tenantId: person.tenantId,
        status: 'ready',
        deletedAt: null,
        orderMode: 'delivery',
        'deliveryConfirmation.status': 'pending',
      })
        .select('orderNumber status deliveryAddress deliveryConfirmation customer.name createdAt')
        .sort({ createdAt: -1 })
        .lean(),

      // Pedidos asignados a este delivery (activos)
      Order.find({
        tenantId: person.tenantId,
        deletedAt: null,
        orderMode: 'delivery',
        'deliveryConfirmation.deliveryPersonId': person._id,
        status: { $in: ['en_ruta', 'arrived'] },
      })
        .select('orderNumber status deliveryAddress deliveryConfirmation customer.name createdAt')
        .sort({ createdAt: -1 })
        .lean(),

      // Últimas 20 entregas completadas por este delivery
      Order.find({
        tenantId: person.tenantId,
        deletedAt: null,
        orderMode: 'delivery',
        'deliveryConfirmation.deliveryPersonId': person._id,
        status: 'delivered',
      })
        .select('orderNumber status deliveryAddress deliveryConfirmation customer.name createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ])

    return NextResponse.json({
      person: {
        _id: person._id,
        name: person.name,
        phone: person.phone,
      },
      availableOrders,
      activeOrders,
      completedOrders,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
