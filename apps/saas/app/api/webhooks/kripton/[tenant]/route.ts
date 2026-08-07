import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import PaymentNotification from '@/models/PaymentNotification'
import { getPayment } from '@/lib/kripton'
import { decrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { injectOrderToPOS } from '@/lib/pos/inject-order'
import { addPointsFromOrder, processRewardDeduction, revertRewardRedemptions } from '@/lib/loyalty'

const KRIPTON_CONFIRMED_STATES = ['confirmed', 'payed', 'pre_confirmed', 'completing']
const KRIPTON_FAILED_STATES = ['expired', 'cancel', 'cancelled', 'rejected']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  try {
    await connectDB()
    const body = await request.json()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
    if (!tenant?.kripton?.apiKey) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Extraer external_code del body del webhook.
    // Kripton envía información resumida — intentamos distintos formatos posibles.
    const externalCode: string | null =
      body.external_code ||
      body.data?.external_code ||
      body.payment?.external_code ||
      body.token ||
      null

    if (!externalCode) {
      console.warn('[Webhook Kripton] No se pudo extraer external_code del webhook body')
      return NextResponse.json({ received: true, warning: 'No external_code' })
    }

    // Validación cruzada: consultar API de Kripton para verificar estado real
    // No confiamos en el body del webhook porque no está firmado.
    const apiKey = decrypt(tenant.kripton.apiKey)
    let paymentData: any

    try {
      paymentData = await getPayment(apiKey, externalCode)
    } catch (err: any) {
      console.error(`[Webhook Kripton] Error en validación cruzada para ${externalCode}:`, err.message)
      // Si falla la consulta, respondemos 200 para que Kripton no reintente.
      // La orden queda en awaiting_payment hasta que llegue otro webhook o el cron la limpie.
      return NextResponse.json({ received: true, warning: 'Cross-validation failed' })
    }

    const state = paymentData?.state || ''

    // Si el estado es transitorio (pending, in_process, waiting, checking, on_hold, user),
    // no hacemos nada, solo acusamos recibo.
    const isTransient = ['pending', 'in_process', 'waiting', 'checking', 'on_hold', 'user'].includes(state)
    if (isTransient) {
      return NextResponse.json({ received: true, state })
    }

    // Si es un estado final de éxito o fracaso, procesamos con transacción ACID
    const isConfirmed = KRIPTON_CONFIRMED_STATES.includes(state)
    const isFailed = KRIPTON_FAILED_STATES.includes(state)

    if (!isConfirmed && !isFailed) {
      console.warn(`[Webhook Kripton] Estado desconocido: ${state} para external_code ${externalCode}`)
      return NextResponse.json({ received: true, state })
    }

    // ── Transacción ACID ──────────────────────────────────────────────────
    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        // 1. Idempotencia: verificar si ya procesamos este pago
        const existing = await PaymentNotification.findOne({
          mpId: externalCode,
          tenantId: tenant._id,
          processed: true,
        }).session(session)

        if (existing) {
          return
        }

        // 2. Buscar la orden por external_code
        const order = await Order.findOne({
          'payment.kriptonExternalCode': externalCode,
          tenantId: tenant._id,
        }).session(session)

        if (!order) {
          console.warn(`[Webhook Kripton] Orden no encontrada para external_code: ${externalCode}`)
          // Igual registramos la notificación para tracking
          const notification = new PaymentNotification({
            mpId: externalCode,
            topic: 'kripton_payment',
            tenantId: tenant._id,
            payload: paymentData,
            processed: true,
            processedAt: new Date(),
          })
          await notification.save({ session })
          return
        }

        // 3. Actualizar orden según estado
        order.payment.status = isConfirmed ? 'approved' : 'rejected'
        order.payment.kriptonData = paymentData

        if (isConfirmed && order.status === 'awaiting_payment') {
          order.status = 'confirmed'

          // Solo acceder a customer si existe (puede no tener phoneHash)
          if (order.customer?.phoneHash) {
            // Procesar deducción de puntos por ítems de premio
            if (order.rewardItems && order.rewardItems.length > 0) {
              await processRewardDeduction(order, tenant, session)
            }
            // Sumar puntos de lealtad
            await addPointsFromOrder(order, tenant, session)
          }
        } else if (isFailed) {
          order.status = 'cancelled'
          await revertRewardRedemptions(order, tenant, session)
        }

        await order.save({ session })

        // 4. Registrar notificación
        const notification = new PaymentNotification({
          mpId: externalCode,
          topic: 'kripton_payment',
          tenantId: tenant._id,
          payload: paymentData,
          processed: true,
          processedAt: new Date(),
          orderId: order._id as any,
        })
        await notification.save({ session })
      })

      // 5. Inyección POS (fire-and-forget, fuera de la transacción)
      if (isConfirmed) {
        const order = await Order.findOne({
          'payment.kriptonExternalCode': externalCode,
          tenantId: tenant._id,
        }).lean()

        if (order && tenant.posIntegration?.enabled) {
          setImmediate(() => {
            injectOrderToPOS(order._id.toString(), tenant).catch(err =>
              console.error('[POS inject Kripton] Error asíncrono:', err)
            )
          })
        }
      }

      return NextResponse.json({ received: true, state })
    } catch (txError: any) {
      console.error(`[Webhook Kripton] Error en transacción para ${externalCode}:`, txError)

      await PaymentNotification.updateOne(
        { mpId: externalCode, tenantId: tenant._id },
        { error: txError.message || String(txError) }
      ).catch(() => {})

      return NextResponse.json({ error: 'Error interno en persistencia' }, { status: 500 })
    } finally {
      await session.endSession()
    }
  } catch (error: any) {
    console.error(`[Webhook Kripton] Error general para tenant ${tenantSlug}:`, error)
    return NextResponse.json({ error: 'Error al procesar webhook' }, { status: 500 })
  }
}
