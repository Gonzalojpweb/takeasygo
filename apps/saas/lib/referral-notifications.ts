// ============================================================================
// Avisos push del programa de referidos (al socio que invita)
// ============================================================================
// Llegan a los celulares donde el socio activó «Avisame» en «Invitá y ganá»
// (PushSubscription con su memberId, guardado por /referrals/notifications
// con el token del club, nunca desde el cuerpo del pedido).
//   joined   → «Lucía M. se sumó con tu link»
//   credited → «Ganaste 150 puntos»
//   reverted → «Se descontaron 100 puntos» (pedido cancelado)
//   reward   → «¡Desbloqueaste tu premio!»
// Nunca lanza: un aviso que no sale no puede cortar un pedido ni un registro.
// ============================================================================

import type { Types } from 'mongoose'
import PushSubscription from '@/models/PushSubscription'
import Tenant from '@/models/Tenant'
import { sendPushToSubscription } from '@/lib/push'

export type ReferralNotice =
  | { kind: 'joined'; inviteeName: string; pendingPoints: number }
  | { kind: 'credited'; inviteeName: string; points: number; steps: string[] }
  | { kind: 'reverted'; inviteeName: string; points: number; steps: string[] }
  | { kind: 'reward'; inviteeName: string; rewardName: string }

export function noticeCopy(n: ReferralNotice): { title: string; body: string } {
  switch (n.kind) {
    case 'joined':
      return {
        title: `🎉 ${n.inviteeName} se sumó con tu link`,
        body: n.pendingPoints > 0 ? `Ganás ${n.pendingPoints} puntos cuando haga su primera compra.` : 'Seguí su avance en «Invitá y ganá».',
      }
    case 'credited':
      return { title: `⭐ Ganaste ${n.points} puntos`, body: `${n.inviteeName}: ${n.steps.join(' · ')}.` }
    case 'reverted':
      return { title: `Se descontaron ${n.points} puntos`, body: `${n.inviteeName} canceló un pedido (${n.steps.join(' · ')}).` }
    case 'reward':
      return { title: '🎁 ¡Desbloqueaste tu premio!', body: `${n.inviteeName} completó el recorrido. Tenés «${n.rewardName}» para canjear en el local.` }
  }
}

export async function notifyReferrer(tenantId: Types.ObjectId | string, memberId: Types.ObjectId | string, notice: ReferralNotice): Promise<number> {
  try {
    // Sin claves VAPID (tests, entornos de preview sin push) no hay a quién mandar.
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return 0
    const subs = await PushSubscription.find({ tenantId, memberId })
      .select('endpoint p256dh auth clientToken')
      .lean<Array<{ endpoint: string; p256dh: string; auth: string; clientToken: string }>>()
    if (subs.length === 0) return 0
    const tenant = await Tenant.findById(tenantId).select('slug').lean<{ slug: string } | null>()
    const url = tenant ? `/${tenant.slug}/club/invitar` : '/app'
    const { title, body } = noticeCopy(notice)
    const results = await Promise.all(subs.map((s) => sendPushToSubscription(s, title, body, url)))
    return results.filter(Boolean).length
  } catch (err) {
    console.error('[referral-notifications] no se pudo avisar al socio', err)
    return 0
  }
}
