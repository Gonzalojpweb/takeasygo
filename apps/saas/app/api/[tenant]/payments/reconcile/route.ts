import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import PaymentNotification from '@/models/PaymentNotification'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { sendReservationConfirmation } from '@/lib/reservationNotifications'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { addPointsFromOrder } from '@/lib/loyalty'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'
import { captureCheckoutCompletedFromOrder } from '@/lib/events-server'
import { requireCronSecretOrAdmin } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  try {
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    // Cerrado: era anónimo. Ahora cron (CRON_SECRET) o admin del tenant.
    const authError = await requireCronSecretOrAdmin(request, String(tenant._id))
    if (authError) return authError

    if (!tenant.mercadopago.isConfigured || !tenant.mercadopago.accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 400 })
    }

    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)

    // Buscar órdenes pendientes de las últimas 24 horas
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    const pendingOrders = await Order.find({
      tenantId: tenant._id,
      deletedAt: null,
      'payment.status': 'pending',
      createdAt: { $gte: oneDayAgo }
    })

    const pendingReservations = await Reservation.find({
      tenantId: tenant._id,
      'payment.status': 'pending',
      createdAt: { $gte: oneDayAgo }
    })

    const results = {
      orders: { scanned: pendingOrders.length, healed: 0, errors: 0 },
      reservations: { scanned: pendingReservations.length, healed: 0, errors: 0 }
    }

    // Procesar Órdenes
    for (const order of pendingOrders) {
      try {
        // Buscar en MP por external_reference (orderNumber)
        const mpSearch = await paymentClient.search({
          options: {
            external_reference: order.orderNumber,
          }
        })

        const payment = mpSearch.results?.find(r => r.status === 'approved')
        
        if (payment) {
          // prev del ORDER status, capturado antes de mutar: reconcile solo
          // emite checkout_completed si esta es la PRIMERA confirmación
          // (criterio único en lib/events-server.ts) — una orden ya
          // confirmada con payment pending (ej. efectivo) no re-emite.
          const previousStatus = order.status
          // Iniciar transacción para el healing
          const session = await mongoose.startSession()
          await session.withTransaction(async () => {
            // Actualizar la orden
            order.payment.status = 'approved'
            order.payment.mercadopagoId = String(payment.id)
            order.payment.mercadopagoData = payment as any
            order.status = 'confirmed'
            await order.save({ session })

            // Sumar puntos al club de fidelidad si corresponde
            await addPointsFromOrder(order, tenant, session)

            // Registrar en PaymentNotification para que no lo procese un webhook tardío
            await PaymentNotification.findOneAndUpdate(
              { mpId: String(payment.id), tenantId: tenant._id },
              { 
                topic: 'payment',
                payload: payment,
                processed: true,
                processedAt: new Date(),
                orderId: order._id as any,
                note: 'Healed by reconciliation'
              },
              { upsert: true, session }
            )
          })
          await session.endSession()
          finalizeHiddenRewardClaims(order._id, order.customerPhoneHash).catch(() => {})
          // checkout_completed post-commit (gate becameCompleted + dedup atómico)
          captureCheckoutCompletedFromOrder(order, tenant._id, previousStatus).catch(err =>
            console.error('[reconcile] checkout_completed event error:', err)
          )
          results.orders.healed++
        }
      } catch (err) {
        console.error(`[Reconcile] Error en orden ${order.orderNumber}:`, err)
        results.orders.errors++
      }
    }

    // Procesar Reservas
    for (const res of pendingReservations) {
      try {
        const externalRef = `reserva_${res._id}`
        const mpSearch = await paymentClient.search({
          options: {
            external_reference: externalRef,
          }
        })

        const payment = mpSearch.results?.find(r => r.status === 'approved')

        if (payment) {
          const session = await mongoose.startSession()
          await session.withTransaction(async () => {
            res.payment.status = 'approved'
            res.payment.mercadopagoId = String(payment.id)
            res.status = 'confirmed'
            await res.save({ session })

            await PaymentNotification.findOneAndUpdate(
              { mpId: String(payment.id), tenantId: tenant._id },
              { 
                topic: 'payment',
                payload: payment,
                processed: true,
                processedAt: new Date(),
                reservationId: res._id as any,
                note: 'Healed by reconciliation'
              },
              { upsert: true, session }
            )
          })
          await session.endSession()

          // Notificación post-commit (patrón del webhook MP): la reserva
          // quedó confirmada sin pasar por el webhook — enviar confirmación
          // al cliente + WhatsApp al admin si no salió antes.
          if (!res.notifications?.confirmationSent) {
            const resLoc = (res.locationId ? await Location.findById(res.locationId).lean() : null) as {
              name?: string
              spaces?: Array<{ _id?: unknown; name: string }>
            } | null
            const spaceName = resLoc?.spaces?.find(
              s => String(s._id) === String(res.spaceId)
            )?.name
            sendReservationConfirmation(
              {
                reservationNumber: res.reservationNumber,
                name: safeDecrypt(res.name),
                phone: safeDecrypt(res.phone),
                email: res.email || undefined,
                clientToken: res.clientToken || undefined,
                date: res.date,
                time: res.time,
                partySize: res.partySize,
                notes: res.notes || '',
                status: 'confirmed',
                paymentAmountCents: res.payment?.amount || 0,
                spaceName,
              },
              { name: tenant.name, slug: tenant.slug },
              resLoc?.name || undefined,
              tenant._id.toString(),
              res.locationId?.toString()
            ).catch(e => console.error('[reconcile] reservation confirmation error:', e))
            await Reservation.updateOne(
              { _id: res._id },
              { $set: { 'notifications.confirmationSent': true } }
            )
          }

          results.reservations.healed++
        }
      } catch (err) {
        console.error(`[Reconcile] Error en reserva ${res._id}:`, err)
        results.reservations.errors++
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date(),
      results
    })

  } catch (error: any) {
    console.error('[Reconcile] Error general:', error)
    return NextResponse.json({ error: 'Error reconciliando pagos' }, { status: 500 })
  }
}
