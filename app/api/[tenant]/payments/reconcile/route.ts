import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import Tenant from '@/models/Tenant'
import PaymentNotification from '@/models/PaymentNotification'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  try {
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

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
          // Iniciar transacción para el healing
          const session = await mongoose.startSession()
          await session.withTransaction(async () => {
            // Actualizar la orden
            order.payment.status = 'approved'
            order.payment.mercadopagoId = String(payment.id)
            order.payment.mercadopagoData = payment as any
            order.status = 'confirmed'
            await order.save({ session })

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
