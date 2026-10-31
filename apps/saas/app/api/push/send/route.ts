import { connectDB } from '@/lib/mongoose'
import PushSubscription from '@/models/PushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { requireSuperAdmin } from '@/lib/apiAuth'

try {
  webpush.setVapidDetails(
    'mailto:clickandthink1@gmail.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
} catch {
  // Sin VAPID en el ambiente: Next importa todas las rutas al build y
  // setVapidDetails revienta sin claves — no debe romper el build.
}

export async function POST(request: NextRequest) {
  let clientToken: string | null = null
  try {
    // Solo superadmin (hotfix S3, 31/10/2026): antes cualquier sesión, incluido
    // un cliente, mandaba título, texto y link libres a cualquier suscripción.
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { clientToken: rawToken, title, body, url } = await request.json()
    clientToken = typeof rawToken === 'string' ? rawToken : null

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
      url: url ?? '/app',
      icon: '/tgoicon-192.png',
      badge: '/tgoicon-192.png',
    })

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    )

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    // Si el endpoint expiró (410), eliminar la suscripción
    if (error?.statusCode === 410) {
      if (clientToken) await PushSubscription.deleteOne({ clientToken })
      return NextResponse.json({ error: 'Suscripción expirada, eliminada' }, { status: 410 })
    }
    console.error('[push/send]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
