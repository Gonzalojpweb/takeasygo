import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import PushSubscription from '@/models/PushSubscription'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { sendBulkPush, getSubscribersByPhoneHashes, logPushNotification, getLastBroadcastTime } from '@/lib/push'
import type { PushTargetType } from '@/models/PushNotificationLog'

const BROADCAST_COOLDOWN_MS = 30 * 60 * 1000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { title, body: messageBody, url, targetType, memberIds } = body

    if (!title || !messageBody) {
      return NextResponse.json({ error: 'Faltan título o mensaje' }, { status: 400 })
    }

    const tenantId = tenant._id.toString()

    // ── Rate limit broadcasts ─────────────────────────────────────────
    if (targetType === 'all_members' || targetType === 'all_consumers') {
      const lastTime = await getLastBroadcastTime(tenantId)
      if (lastTime && (Date.now() - lastTime.getTime()) < BROADCAST_COOLDOWN_MS) {
        const remaining = Math.ceil((BROADCAST_COOLDOWN_MS - (Date.now() - lastTime.getTime())) / 60000)
        return NextResponse.json({
          error: `Ya enviaste una notificación hace poco. Podés enviar otra en ${remaining} minuto(s).`,
        }, { status: 429 })
      }
    }

    let subscriptions: any[] = []
    let actualTargetType: PushTargetType = targetType

    if (targetType === 'all_members') {
      const members = await LoyaltyMember.find({ tenantId, status: 'active' }).select('phoneHash').lean()
      const phoneHashes = members.map(m => m.phoneHash).filter(Boolean)
      subscriptions = await getSubscribersByPhoneHashes(tenantId, phoneHashes)
    } else if (targetType === 'all_consumers') {
      const Consumer = (await import('@/models/Consumer')).default
      const consumers = await Consumer.find({ tenantIds: tenantId }).select('phoneHash').lean()
      const phoneHashes = consumers.map(c => c.phoneHash).filter(Boolean)
      subscriptions = await getSubscribersByPhoneHashes(tenantId, phoneHashes)
    } else if (targetType === 'specific_members' && memberIds?.length) {
      const members = await LoyaltyMember.find({ _id: { $in: memberIds }, tenantId }).select('phoneHash').lean()
      const phoneHashes = members.map(m => m.phoneHash).filter(Boolean)
      subscriptions = await getSubscribersByPhoneHashes(tenantId, phoneHashes)
      actualTargetType = 'specific_members'
    } else {
      return NextResponse.json({ error: 'Tipo de destino inválido' }, { status: 400 })
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({ message: 'No hay suscripciones activas para este destino', successCount: 0, failCount: 0 })
    }

    const result = await sendBulkPush(subscriptions, title, messageBody, url)

    await logPushNotification({
      tenantId,
      sentBy: user.id,
      sentByRole: user.role === 'manager' ? 'manager' : 'admin',
      title,
      body: messageBody,
      url,
      targetType: actualTargetType,
      targetCount: subscriptions.length,
      successCount: result.successCount,
      failCount: result.failCount,
    })

    return NextResponse.json({
      success: true,
      successCount: result.successCount,
      failCount: result.failCount,
      total: subscriptions.length,
    })
  } catch (error) {
    console.error('[push/send]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
