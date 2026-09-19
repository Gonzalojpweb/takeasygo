import crypto from 'crypto'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import Tenant from '@/models/Tenant'
import PaymentNotification from '@/models/PaymentNotification'
import ProcessedWebhookEvents from '@/models/ProcessedWebhookEvents'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { injectOrderToPOS } from '@/lib/pos/inject-order'
import { addPointsFromOrder, processRewardDeduction, revertRewardRedemptions } from '@/lib/loyalty'
import { confirmOrderPayment } from '@/lib/sync-layer'
import { sendReservationConfirmation } from '@/lib/reservationNotifications'
import PushSubscription from '@/models/PushSubscription'
import webpush from 'web-push'
import { sendAdminPushNotification } from '@/lib/push'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'
import { findMpAccountById, getActiveMpAccount } from '@/lib/mercadopago'
import type { ResolvedMpAccount } from '@/lib/mercadopago'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000 // ±5 minutes

/**
 * Verifica la firma HMAC-SHA256 que MercadoPago envía en el header x-signature.
 */
function verifyMercadoPagoSignature(
  signatureHeader: string | null,
  requestId: string | null,
  dataId: string | number | null | undefined,
  secret: string
): { valid: boolean; ts?: string } {
  if (!signatureHeader || !requestId || dataId == null) return { valid: false }

  const parts: Record<string, string> = {}
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=')
    if (key && value) parts[key.trim()] = value.trim()
  }

  const { ts, v1 } = parts
  if (!ts || !v1) return { valid: false }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    const valid = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
    return { valid, ts }
  } catch {
    return { valid: false }
  }
}

/**
 * Envía alerta when security events occur. Fire-and-forget.
 */
async function sendSecurityAlert(tenantSlug: string, message: string, details: Record<string, any>) {
  try {
    // TODO: wire to Slack/email webhook in production
    console.warn(`[SECURITY ALERT][${tenantSlug}] ${message}`, details)
  } catch {
    // never throw
  }
}

/**
 * Builds a deduplicated list of candidate accounts to try for signature verification.
 * Order: hintAccount first, then active, then remaining accounts from mpAccounts[].
 */
function buildCandidateAccounts(
  tenant: any,
  hintAccount: ResolvedMpAccount | null,
  activeAccount: ResolvedMpAccount | null
): ResolvedMpAccount[] {
  const candidates: ResolvedMpAccount[] = []
  const seenIds = new Set<string>()

  if (hintAccount) {
    candidates.push(hintAccount)
    seenIds.add(hintAccount.accountId)
  }

  if (activeAccount && !seenIds.has(activeAccount.accountId)) {
    candidates.push(activeAccount)
    seenIds.add(activeAccount.accountId)
  }

  for (const acc of tenant.mpAccounts ?? []) {
    const accId = acc._id?.toString() ?? ''
    if (!seenIds.has(accId)) {
      candidates.push({
        accountId: accId,
        accessToken: acc.accessToken,
        publicKey: acc.publicKey,
        webhookSecret: acc.webhookSecret,
        oauthAccessToken: acc.oauthAccessToken ?? null,
        oauthIsConnected: !!acc.oauthIsConnected,
        oauthExpiresAt: acc.oauthExpiresAt ?? null,
        commissionPercent: null,
        label: acc.label,
      })
      seenIds.add(accId)
    }
  }

  if (!seenIds.has('legacy')) {
    const legacy = getActiveMpAccount(tenant)
    if (legacy && legacy.accountId === 'legacy') {
      candidates.push(legacy)
    }
  }

  return candidates
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params
  const traceId = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown'

  try {
    await connectDB()

    // ── 0. Parse body first (needed for type check) ─────────────────────────
    const body = await request.json()

    // Solo nos interesan pagos por ahora
    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const mpPaymentId = String(body.data?.id)

    // ── 1. Firma HMAC — primero, antes de tocar DB ─────────────────────────
    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
    if (!tenant) {
      console.warn(`[Webhook MP][${traceId}] Tenant not found: ${tenantSlug}`)
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const signatureHeader = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')

    // ── 1. Dedup por request-id — ANTES de HMAC (evita DoS) ─────────────────
    if (requestId) {
      const alreadyProcessed = await ProcessedWebhookEvents.findOne({ requestId })
      if (alreadyProcessed) {
        console.info(`[Webhook MP][${traceId}] Duplicate request-id, skip | tenant=${tenantSlug} | requestId=${requestId}`)
        return NextResponse.json({ received: true, note: 'Duplicate' })
      }
    }

    // ── 2. Resolve hint account from ?account= (may be absent — MP strips it) ─
    const urlAccount = request.nextUrl.searchParams.get('account')
    let hintAccount: ResolvedMpAccount | null = null
    if (urlAccount) {
      hintAccount = findMpAccountById(tenant, urlAccount)
      if (!hintAccount) {
        console.warn(`[Webhook MP][${traceId}] ?account=${urlAccount} not found in tenant.mpAccounts`)
      }
    }
    const activeAccount = getActiveMpAccount(tenant)

    // ── 3. Try-all-secrets: iterate every account's webhookSecret ─────────────
    //    Constant-time: try ALL candidates, don't early-return on first match.
    //    This eliminates dependency on ?account= being preserved by MP.
    const candidates = buildCandidateAccounts(tenant, hintAccount, activeAccount)
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 401 })
    }

    let sigValid = false
    let sigTs: string | undefined
    let accountForSecret: ResolvedMpAccount | null = null

    for (const candidate of candidates) {
      try {
        const secret = decrypt(candidate.webhookSecret)
        const result = verifyMercadoPagoSignature(signatureHeader, requestId, mpPaymentId, secret)
        // Always check — accumulate matches (constant-time: don't break on first)
        if (result.valid) {
          sigValid = true
          sigTs = result.ts
          accountForSecret = candidate
        }
      } catch {
        // Decryption failed for this candidate, try next
      }
    }

    if (!sigValid || !accountForSecret) {
      console.warn(`[Webhook MP][${traceId}] Firma inválida en todas las cuentas | tenant=${tenantSlug} | mpId=${mpPaymentId} | ip=${clientIp} | candidates=${candidates.map(c => c.accountId).join(',')}`)
      sendSecurityAlert(tenantSlug, 'Firma webhook inválida (todas las cuentas)', {
        mpPaymentId, ip: clientIp, candidateIds: candidates.map(c => c.accountId), traceId,
      })
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 })
    }

    console.info(`[Webhook MP][${traceId}] Signature verified | tenant=${tenantSlug} | mpId=${mpPaymentId} | matchedAccount=${accountForSecret.accountId}`)

    // ── 2. Timestamp replay — ±5 min, antes de tocar DB ────────────────────
    if (sigTs) {
      const tsAge = Date.now() - Number(sigTs) * 1000
      if (Math.abs(tsAge) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
        console.warn(`[Webhook MP][${traceId}] Timestamp fuera de ventana | tenant=${tenantSlug} | ts=${sigTs} | age=${tsAge}ms | ip=${clientIp}`)
        sendSecurityAlert(tenantSlug, 'Timestamp webhook fuera de ventana', {
          mpPaymentId, ts: sigTs, ageMs: tsAge, ip: clientIp, traceId,
        })
        return NextResponse.json({ error: 'Timestamp fuera de ventana' }, { status: 401 })
      }
    }

    // ── 3. Idempotencia por mpPaymentId (ya existente) ──────────────────────
    const existingNotification = await PaymentNotification.findOne({
      mpId: mpPaymentId,
      tenantId: tenant._id,
      processed: true
    })
    if (existingNotification) {
      return NextResponse.json({ received: true, note: 'Duplicate' })
    }

    // ── 5. Sanitizar mpPaymentId antes de SDK ───────────────────────────────
    if (!/^\d+$/.test(mpPaymentId)) {
      console.warn(`[Webhook MP][${traceId}] mpPaymentId inválido (no numérico) | tenant=${tenantSlug} | mpId=${mpPaymentId}`)
      return NextResponse.json({ error: 'ID de pago inválido' }, { status: 400 })
    }

    // ── 6. Obtener data de Mercado Pago ─────────────────────────────────────
    const accessToken = decrypt(accountForSecret.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)
    const paymentData = await paymentClient.get({ id: mpPaymentId })
    const externalRef = paymentData.external_reference || ''

    // ── 7. Registrar request-id para dedup futura ───────────────────────────
    if (requestId) {
      await ProcessedWebhookEvents.create({ requestId, createdAt: new Date() })
        .catch(err => console.warn(`[Webhook MP][${traceId}] Failed to save dedup record:`, err.message))
    }

    // ── 8. Resolver cuenta desde Order (fuente de verdad) ───────────────────
    let resolvedAccountId: string | null = null
    let orderIdForLog: string | null = null
    if (!externalRef.startsWith('reserva_')) {
      const order = await Order.findOne({ orderNumber: externalRef, tenantId: tenant._id })
        .select('payment.mpAccountId orderNumber')
        .lean()
      if (order) {
        resolvedAccountId = (order as any).payment?.mpAccountId ?? null
        orderIdForLog = order.orderNumber
      }
    }

    // ── 9. Cruzar ?account= con Order (hint vs reality) ─────────────────────
    if (resolvedAccountId && urlAccount && urlAccount !== resolvedAccountId) {
      console.warn(`[Webhook MP][${traceId}] ?account=${urlAccount} DIFIERE de Order.mpAccountId=${resolvedAccountId} | tenant=${tenantSlug} | order=${orderIdForLog}`)
      sendSecurityAlert(tenantSlug, '?account= difiere de Order.mpAccountId', {
        urlAccount, resolvedAccountId, orderId: orderIdForLog, mpPaymentId, ip: clientIp, traceId,
      })
    } else if (urlAccount && urlAccount === resolvedAccountId) {
      console.info(`[Webhook MP][${traceId}] ?account= coincide con Order | tenant=${tenantSlug} | order=${orderIdForLog}`)
    } else if (!urlAccount) {
      console.info(`[Webhook MP][${traceId}] Sin ?account= (legacy) | tenant=${tenantSlug} | order=${orderIdForLog}`)
    }

    // ── 10. Resolver cuenta final para procesar ─────────────────────────────
    //    accountForSecret = the account whose signature matched (from try-all-secrets)
    //    processAccount = the account to use for SDK calls (prefer Order's mpAccountId)
    //
    //    Cases:
    //    - Tenant has zero accounts → caught earlier (401 at candidates.length === 0)
    //    - Signature matches → accountForSecret is set
    //    - Order has mpAccountId pointing to existing account → use that
    //    - Order has mpAccountId pointing to DELETED account → 200 + alert (permanent, retry won't fix)
    //    - Order has no mpAccountId → use accountForSecret (try-all-secrets resolved it)
    let processAccount = accountForSecret
    if (resolvedAccountId) {
      const orderAccount = findMpAccountById(tenant, resolvedAccountId)
      if (orderAccount) {
        processAccount = orderAccount
      } else {
        // Order.mpAccountId references deleted account — permanent config error
        // 200 + alert: retrying won't fix a deleted account
        console.warn(`[Webhook MP][${traceId}] Order.mpAccountId=${resolvedAccountId} NO existe en tenant.mpAccounts | tenant=${tenantSlug} | order=${orderIdForLog}`)
        sendSecurityAlert(tenantSlug, 'Order.mpAccountId huérfano — revisión manual requerida', {
          resolvedAccountId, orderId: orderIdForLog, mpPaymentId, tenantSlug, traceId,
        })
        return NextResponse.json({ received: true, note: 'Account not found — manual review needed' })
      }
    }
    // processAccount is guaranteed non-null here: try-all-secrets already matched a signature

    console.info(`[Webhook MP][${traceId}] Processing | tenant=${tenantSlug} | mpId=${mpPaymentId} | order=${orderIdForLog} | accountId=${processAccount.accountId}`)

    // Aplicar defaults para tenants creados antes de pointsConfig
    if (!tenant.pointsConfig) {
      tenant.pointsConfig = {
        enabled: true,
        mode: 'fixed_per_currency',
        pointsPerCurrency: 0.1,
        pointsPercentage: 10,
        pointsPerOrder: 0,
        minOrderForPoints: 0,
        pointsRedemptionValue: 10,
        redemptionEnabled: true,
      }
    }

    // ── 11. Transacción ACID (fallback a writes individuales si standalone) ──
    let session: mongoose.ClientSession | null = null
    let useTransaction = true
    try {
      session = await mongoose.startSession()
    } catch {
      console.warn(`[Webhook MP][${traceId}] startSession() failed — standalone mode, no transactions | tenant=${tenantSlug}`)
      useTransaction = false
    }

    try {
      const txBody = async () => {
        // A. Registrar la notificación
        const notification = await PaymentNotification.findOneAndUpdate(
          { mpId: mpPaymentId, tenantId: tenant._id },
          {
            topic: body.type,
            payload: paymentData,
            processed: false
          },
          { upsert: true, new: true, session }
        )

        // B. Lógica de Negocio: Actualizar Orden o Reserva
        if (externalRef.startsWith('reserva_')) {
          const reservaId = externalRef.replace('reserva_', '')
          const reservation = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id }).session(session)

          if (reservation) {
            reservation.payment.mercadopagoId = mpPaymentId
            reservation.payment.status = paymentData.status as any

            if (paymentData.status === 'approved') {
              reservation.status = 'confirmed'
              reservation.payment.status = 'approved'
            } else if (['rejected', 'cancelled'].includes(paymentData.status!)) {
              reservation.payment.status = 'rejected'
            }

            await reservation.save({ session })
            notification.reservationId = reservation._id as any
          }
        } else {
          // Asumimos que es una Orden (external_reference = orderNumber)
          const order = await Order.findOne({ orderNumber: externalRef, tenantId: tenant._id }).session(session)

          if (order) {
            order.payment.status = paymentData.status as any
            order.payment.mercadopagoData = paymentData as any
            order.payment.mercadopagoId = mpPaymentId

            // ── Persist mpAccountId if Order doesn't have it yet (race condition fix) ──
            //    When create-preference saves mpAccountId AFTER preference.create(),
            //    the webhook can arrive before the save. Try-all-secrets already identified
            //    the correct account from the signature — persist it now.
            if (!order.payment.mpAccountId && processAccount.accountId && processAccount.accountId !== 'legacy') {
              order.payment.mpAccountId = processAccount.accountId
              console.info(`[Webhook MP][${traceId}] Persisted mpAccountId=${processAccount.accountId} to order ${order.orderNumber} (was null)`)
            }

            if (paymentData.status === 'approved') {
              if (order.status === 'awaiting_payment') {
                order.status = 'confirmed'
              }

              if (order.customer?.phoneHash) {
                if (order.rewardItems && order.rewardItems.length > 0) {
                  await processRewardDeduction(order, tenant, session ?? undefined)
                }
                await addPointsFromOrder(order, tenant, session ?? undefined)
              }

              // ── Inyección POS (fire-and-forget) ──────────────────────────
              if (tenant.posIntegration?.enabled) {
                setImmediate(() => {
                  injectOrderToPOS(order._id.toString(), tenant).catch(err =>
                    console.error('[POS inject] Error asíncrono:', err)
                  )
                })
              }

              // ── SyncLayer: confirmar orden + notificar venta ──────────
              setImmediate(() => {
                confirmOrderPayment(order, tenant).catch(err =>
                  console.error('[sync-layer] confirmOrderPayment error:', err)
                )
              })
            } else if (['rejected', 'cancelled'].includes(paymentData.status!)) {
              order.status = 'cancelled'
              await revertRewardRedemptions(order, tenant, session ?? undefined)
            }

            await order.save({ session })

            // Consumir hidden reward claims (idempotente)
            if (paymentData.status === 'approved' && order.status === 'confirmed') {
              finalizeHiddenRewardClaims(order._id, order.customer?.phoneHash).catch(() => {})
            }

            // ── Push notification al consumidor (fire-and-forget) ──────────
            if (paymentData.status === 'approved' && 'clientToken' in order && order.clientToken) {
              const clientToken = order.clientToken
              const orderNum = order.orderNumber
              const tSlug = tenant.slug
              setImmediate(async () => {
                try {
                  const sub = await PushSubscription.findOne({ clientToken }).lean() as any
                  if (sub) {
                    await webpush.sendNotification(
                      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                      JSON.stringify({
                        title: `✅ Pedido confirmado #${orderNum}`,
                        body: 'Tocá para ver el seguimiento de tu pedido',
                        icon: '/tgoicon-192.png',
                        badge: '/tgoicon-192.png',
                        url: `/${tSlug}/tracking/${orderNum}`,
                      })
                    )
                  }
              } catch (err) {
                if ((err as any)?.statusCode === 410) {
                  await PushSubscription.deleteOne({ clientToken }).catch(() => {})
                }
                console.error('[webhook] Consumer push error:', (err as Error)?.message)
              }
            })
          }

          // ── Push notification a admins (fire-and-forget) ──────────
          if (paymentData.status === 'approved') {
            setImmediate(async () => {
              try {
                await sendAdminPushNotification(
                  tenant._id.toString(),
                  tenant.plan ?? 'trial',
                  tenant.name,
                  tenant.slug,
                  order.orderNumber,
                  order.payment.baseTotal ?? 0,
                  order.customer?.name ?? 'Cliente'
                )
              } catch (err) {
                console.error('[webhook] Admin push error:', (err as Error)?.message)
              }
            })
          }

          notification.orderId = order._id as any
          }
        }

        // C. Marcar notificación como exitosa
        notification.processed = true
        notification.processedAt = new Date()
        await notification.save(useTransaction && session ? { session } : {})
      }

      if (useTransaction && session) {
        await session.withTransaction(txBody)
      } else {
        // Standalone mode: execute without transaction (best-effort)
        await txBody()
      }

      if (externalRef.startsWith('reserva_') && paymentData.status === 'approved') {
        const reservaId = externalRef.replace('reserva_', '')
        const reservation = await Reservation.findById(reservaId).lean()
        if (reservation && !reservation.notifications?.confirmationSent) {
          const loc = reservation.locationId ? await (await import('@/models/Location')).default.findById(reservation.locationId).lean() : null
          sendReservationConfirmation(
            {
              reservationNumber: reservation.reservationNumber,
              name: safeDecrypt(reservation.name),
              phone: safeDecrypt(reservation.phone),
              email: reservation.email || undefined,
              clientToken: reservation.clientToken || undefined,
              date: reservation.date,
              time: reservation.time,
              partySize: reservation.partySize,
              notes: reservation.notes || '',
              status: 'confirmed',
            },
            { name: tenant.name, slug: tenant.slug },
            (loc as any)?.name || undefined,
            tenant._id.toString()
          ).catch(e => console.error('[webhook] reservation confirmation error:', e))
          await Reservation.updateOne(
            { _id: reservaId },
            { $set: { 'notifications.confirmationSent': true } }
          )
        }
      }

      return NextResponse.json({ received: true })
    } catch (txError: any) {
      console.error(`[Webhook MP][${traceId}] Error en transacción tenant ${tenantSlug}, mpId ${mpPaymentId}:`, txError.message || txError)

      await PaymentNotification.updateOne(
        { mpId: mpPaymentId, tenantId: tenant._id },
        { error: txError.message || String(txError) }
      ).catch(() => {})

      return NextResponse.json(
        { error: 'Error interno en persistencia' },
        { status: 500, headers: { 'Retry-After': '10' } }
      )
    } finally {
      if (session) await session.endSession()
    }

  } catch (error: any) {
    console.error(`[Webhook MP][${traceId}] Error general tenant ${tenantSlug}:`, error.message || error)
    return NextResponse.json(
      { error: 'Error al procesar webhook' },
      { status: 500, headers: { 'Retry-After': '30' } }
    )
  }
}
