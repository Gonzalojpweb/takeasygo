import { connectDB } from '@/lib/mongoose'
import PushSubscription from '@/models/PushSubscription'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { clientToken, subscription, tenantId } = await request.json()

    if (!clientToken || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Datos de suscripción inválidos' }, { status: 400 })
    }

    await connectDB()

    await PushSubscription.findOneAndUpdate(
      { clientToken },
      {
        clientToken,
        endpoint: subscription.endpoint,
        p256dh:   subscription.keys.p256dh,
        auth:     subscription.keys.auth,
        ...(tenantId ? { tenantId } : {}),
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[push/subscribe]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
