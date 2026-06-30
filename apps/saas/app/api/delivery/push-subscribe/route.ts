import { connectDB } from '@/lib/mongoose'
import DeliveryPerson from '@/models/DeliveryPerson'
import DeliveryPushSubscription from '@/models/DeliveryPushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-delivery-token')
    if (!token) {
      return NextResponse.json({ error: 'Token no proporcionado' }, { status: 401 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await connectDB()

    const person = await DeliveryPerson.findOne({ tokenHash, isActive: true }).lean()
    if (!person) {
      return NextResponse.json({ error: 'Delivery no encontrado o desactivado' }, { status: 404 })
    }

    const { endpoint, p256dh, auth } = await request.json()
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Datos de suscripción incompletos' }, { status: 400 })
    }

    await DeliveryPushSubscription.findOneAndUpdate(
      { deliveryTokenHash: tokenHash, endpoint },
      {
        deliveryTokenHash: tokenHash,
        tenantId: person.tenantId,
        endpoint,
        p256dh,
        auth,
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
