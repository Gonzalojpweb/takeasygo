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

    const pendingOrders = await Order.find({
      tenantId: person.tenantId,
      status: { $in: ['ready', 'en_ruta', 'arrived'] },
      deletedAt: null,
      orderMode: 'delivery',
      $or: [
        { 'deliveryConfirmation.status': 'pending' },
        { 'deliveryConfirmation.status': 'assigned', 'deliveryConfirmation.deliveryPersonId': person._id },
        { 'deliveryConfirmation.status': 'en_ruta', 'deliveryConfirmation.deliveryPersonId': person._id },
        { 'deliveryConfirmation.status': 'arrived', 'deliveryConfirmation.deliveryPersonId': person._id },
      ],
    })
      .select('orderNumber status deliveryAddress deliveryConfirmation customer.name createdAt')
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({
      person: {
        _id: person._id,
        name: person.name,
        phone: person.phone,
      },
      pendingOrders,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
