import crypto from 'crypto'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import Tenant from '@/models/Tenant'
import PaymentNotification from '@/models/PaymentNotification'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'

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
  
  // 1. Conexión y chequeo de firma (esto es fuera de la transacción para ser rápidos)
  try {
    await connectDB()
    const body = await request.json()

    // Solo nos interesan pagos por ahora
    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant?.mercadopago?.accessToken) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
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
      console.warn(`[Webhook MP] Firma invalida para tenant ${tenantSlug}`)
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
              order.status = 'confirmed'
            } else if (['rejected', 'cancelled'].includes(paymentData.status!)) {
              order.status = 'cancelled'
            }

            await order.save({ session })
            notification.orderId = order._id as any
          }
        }

        // C. Marcar notificación como exitosa
        notification.processed = true
        notification.processedAt = new Date()
        await notification.save({ session })
      })

      return NextResponse.json({ received: true })
    } catch (txError: any) {
      console.error(`[Webhook MP] Error en transacción para tenant ${tenantSlug}:`, txError)
      
      // Intentar loguear el error en la notificación (fuera de la tx fallida)
      await PaymentNotification.updateOne(
        { mpId: mpPaymentId, tenantId: tenant._id },
        { error: txError.message || String(txError) }
      ).catch(() => {})

      return NextResponse.json({ error: 'Error interno en persistencia' }, { status: 500 })
    } finally {
      await session.endSession()
    }

  } catch (error: any) {
    console.error(`[Webhook MP] Error general para tenant ${tenantSlug}:`, error)
    return NextResponse.json({ error: 'Error al procesar webhook' }, { status: 500 })
  }
}
