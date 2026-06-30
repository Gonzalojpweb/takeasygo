import crypto from 'crypto'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import PaymentNotification from '@/models/PaymentNotification'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { injectOrderToPOS } from '@/lib/pos/inject-order'
import { addPointsFromOrder, processRewardDeduction } from '@/lib/loyalty'
import { sendReservationConfirmation } from '@/lib/reservationNotifications'
import PushSubscription from '@/models/PushSubscription'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)


/**
 * Verifica la firma HMAC-SHA256 que MercadoPago envía en el header x-signature.
 */
function verifyMercadoPagoSignature(
  signatureHeader: string | null,
  requestId: string | null,
  dataId: string | number | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !requestId || dataId == null) return false

  const parts: Record<string, string> = {}
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=')
    if (key && value) parts[key.trim()] = value.trim()
  }

  const { ts, v1 } = parts
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    return false
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params
  const traceId = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  
  // 1. Conexión y chequeo de firma (esto es fuera de la transacción para ser rápidos)
  try {
    await connectDB()
    const body = await request.json()

    console.log(`[Webhook MP][${traceId}] Recibido:`, body.type, 'ID:', body.data?.id, 'tenant:', tenantSlug)

    // Solo nos interesan pagos por ahora
    if (body.type !== 'payment') {
      console.log('[Webhook MP] Ignorando evento tipo:', body.type)
      return NextResponse.json({ received: true })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
    if (!tenant?.mercadopago?.accessToken) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

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

    if (!tenant.mercadopago.webhookSecret) {
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 401 })
    }

    const webhookSecret = decrypt(tenant.mercadopago.webhookSecret)
    const signatureHeader = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')
    const mpPaymentId = String(body.data?.id)

    const isValid = verifyMercadoPagoSignature(signatureHeader, requestId, mpPaymentId, webhookSecret)
    if (!isValid) {
      console.warn(`[Webhook MP][${traceId}] Firma inválida para tenant ${tenantSlug}, mpId: ${mpPaymentId}`)
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 })
    }

    // 2. Chequeo de idempotencia (¿Ya procesamos este mpPaymentId?)
    const existingNotification = await PaymentNotification.findOne({ 
      mpId: mpPaymentId, 
      tenantId: tenant._id,
      processed: true 
    })

    if (existingNotification) {
      return NextResponse.json({ received: true, note: 'Duplicate' })
    }

    // 3. Obtener data de Mercado Pago antes de entrar en transacción (evita bloqueos largos)
    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)
    const paymentData = await paymentClient.get({ id: mpPaymentId })
    const externalRef = paymentData.external_reference || ''

    // 4. Iniciar Transacción ACID
    const session = await mongoose.startSession()
    
    try {
      await session.withTransaction(async () => {
        // A. Registrar la notificación (aunque aún no esté procesada del todo)
        // Usamos upsert por si acaso llega otra igual en el mismo milisegundo
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

            if (paymentData.status === 'approved') {
              // Solo cambiar a confirmed si estaba en awaiting_payment
              if (order.status === 'awaiting_payment') {
                order.status = 'confirmed'
              }

              if (order.customer?.phoneHash) {
                // Procesar deducción de puntos por ítems de premio (canje con puntos)
                // Si aplica SOS, el saldo quedará en negativo y se marca hasPendingSos
                if (order.rewardItems && order.rewardItems.length > 0) {
                  await processRewardDeduction(order, tenant, session)
                }

                // Usar el helper centralizado para sumar puntos y sincronizar wallet
                // Si el miembro tiene deuda SOS, se descuenta antes de acreditar
                await addPointsFromOrder(order, tenant, session)
              }

              // ── Inyección POS (fire-and-forget) ──────────────────────────
              // Se llama fuera de la transacción MongoDB para no bloquearla.
              // Si falla, el pedido igual existe en TakeasyGO y aparece como
              // posSync.status = 'failed' en el panel del restaurante.
              if (tenant.posIntegration?.enabled) {
                setImmediate(() => {
                  injectOrderToPOS(order._id.toString(), tenant).catch(err =>
                    console.error('[POS inject] Error asíncrono:', err)
                  )
                })
              }
            } else if (['rejected', 'cancelled'].includes(paymentData.status!)) {
              order.status = 'cancelled'
            }

            await order.save({ session })

            // ── Push notification al consumidor (fire-and-forget) ──────────
            if (paymentData.status === 'approved' && 'clientToken' in order && order.clientToken) {
              const clientToken = order.clientToken
              const orderNumber = order.orderNumber
              const tenantSlug = tenant.slug
              setImmediate(async () => {
                try {
                  const sub = await PushSubscription.findOne({ clientToken }).lean() as any
                  if (sub) {
                    await webpush.sendNotification(
                      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                      JSON.stringify({
                        title: `✅ Pedido confirmado #${orderNumber}`,
                        body: 'Tocá para ver el seguimiento de tu pedido',
                        icon: '/tgoicon-192.png',
                        badge: '/tgoicon-192.png',
                        url: `/${tenantSlug}/tracking/${orderNumber}`,
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

            notification.orderId = order._id as any
          }
        }

        // C. Marcar notificación como exitosa
        notification.processed = true
        notification.processedAt = new Date()
        await notification.save({ session })
      })

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
      
      // Intentar loguear el error en la notificación (fuera de la tx fallida)
      await PaymentNotification.updateOne(
        { mpId: mpPaymentId, tenantId: tenant._id },
        { error: txError.message || String(txError) }
      ).catch(() => {})

      return NextResponse.json(
        { error: 'Error interno en persistencia' },
        { status: 500, headers: { 'Retry-After': '10' } }
      )
    } finally {
      await session.endSession()
    }

  } catch (error: any) {
    console.error(`[Webhook MP][${traceId}] Error general tenant ${tenantSlug}:`, error.message || error)
    return NextResponse.json(
      { error: 'Error al procesar webhook' },
      { status: 500, headers: { 'Retry-After': '30' } }
    )
  }
}
