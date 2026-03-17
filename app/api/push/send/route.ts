import { connectDB } from '@/lib/mongoose'
import PushSubscription from '@/models/PushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { auth } from '@/auth'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { clientToken, title, body, url } = await request.json()

    if (!clientToken || !title || !body) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    await connectDB()

    const sub = await PushSubscription.findOne({ clientToken })
    if (!sub) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url ?? '/explore',
      icon: '/tgo192.png',
      badge: '/tgo192.png',
    })

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    )

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    // Si el endpoint expiró (410), eliminar la suscripción
    if (error?.statusCode === 410) {
      const { clientToken } = await request.json().catch(() => ({}))
      if (clientToken) await PushSubscription.deleteOne({ clientToken })
      return NextResponse.json({ error: 'Suscripción expirada, eliminada' }, { status: 410 })
    }
    console.error('[push/send]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
