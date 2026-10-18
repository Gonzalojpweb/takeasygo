import { connectDB } from '@/lib/mongoose'
import PushSubscription from '@/models/PushSubscription'
import { getSessionUser } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { clientToken, subscription, tenantId, memberId, phoneHash } = await request.json()

    if (!clientToken || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Datos de suscripción inválidos' }, { status: 400 })
    }

    await connectDB()

    // ── Aislamiento por sede ──────────────────────────────────────────────
    // Si el request viene con sesión de panel (AdminPushBanner), stampear
    // role/assignedLocations del usuario REAL (server-side, nunca del body:
    // es spoofeable). sendAdminPushNotification los usa para filtrar pushes
    // de otras sedes a managers/cashiers scoped. Sin sesión (consumidor
    // explore/app) no se stampean y el sub queda como legacy.
    const sessionUser = await getSessionUser(request)
    const stamp = sessionUser?.role
      ? {
          userId: sessionUser.id,
          role: sessionUser.role,
          assignedLocations: sessionUser.assignedLocations ?? [],
        }
      : {}

    await PushSubscription.findOneAndUpdate(
      { clientToken },
      {
        clientToken,
        endpoint: subscription.endpoint,
        p256dh:   subscription.keys.p256dh,
        auth:     subscription.keys.auth,
      ...(tenantId ? { tenantId } : {}),
      ...(memberId ? { memberId } : {}),
      ...(phoneHash ? { phoneHash } : {}),
      ...stamp,
      },
      { upsert: true, returnDocument: "after" }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[push/subscribe]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
