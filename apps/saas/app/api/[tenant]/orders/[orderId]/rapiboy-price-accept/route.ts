// Endpoint público (tracking sin sesión) — el cliente acepta o rechaza la
// nueva cotización de Rapiboy. Requiere x-tracking-token como sus hermanos
// del tracking; sin él conocer el orderId bastaba para aceptar/rechazar.
// POST: accept (aceptar) o reject (rechazar)
// GET: status (consultar estado de la cotización)
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { cotizarOnDemand } from '@/lib/rapiboy/client'
import { buildTripParams, createTripForOrder, notifyQuoteRejected, rapiboyConfigFromLocation, recordCreatedTrip } from '@/lib/rapiboy/trips'
import { rateLimit } from '@/lib/rateLimit'

const ACCEPT_WINDOW_MS = 15 * 60 * 1000 // 15 minutos

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const { success } = await rateLimit(`rapiboy-accept:${ip}`, 30, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const trackingToken = request.headers.get('x-tracking-token')
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('trackingToken deliveryProvider payment.status payment.method orderNumber')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!order.trackingToken || order.trackingToken !== trackingToken) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    const rapiboy = order.deliveryProvider?.rapiboy
    if (!rapiboy) {
      return NextResponse.json({ error: 'No hay cotización pendiente' }, { status: 400 })
    }

    const isPending = rapiboy.quoteStatus === 'pending_customer_accept'
    const hasExpired = isPending && rapiboy.pendingQuoteTimestamp
      ? (Date.now() - new Date(rapiboy.pendingQuoteTimestamp).getTime()) > ACCEPT_WINDOW_MS
      : false

    return NextResponse.json({
      quoteStatus: rapiboy.quoteStatus,
      checkoutCost: rapiboy.checkoutCost,
      pendingQuoteCost: rapiboy.pendingQuoteCost,
      pendingQuoteTimestamp: rapiboy.pendingQuoteTimestamp,
      transferBuffer: rapiboy.transferBuffer,
      chargedToCustomer: rapiboy.chargedToCustomer,
      isPending,
      hasExpired,
      remainingMs: isPending && rapiboy.pendingQuoteTimestamp
        ? Math.max(0, ACCEPT_WINDOW_MS - (Date.now() - new Date(rapiboy.pendingQuoteTimestamp).getTime()))
        : 0,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const { success } = await rateLimit(`rapiboy-accept:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
    }

    const body = await request.json()
    const { action } = body as { action: 'accept' | 'reject' }

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const trackingToken = request.headers.get('x-tracking-token')
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!order.trackingToken || order.trackingToken !== trackingToken) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    const rapiboy = order.deliveryProvider?.rapiboy
    if (!rapiboy || rapiboy.quoteStatus !== 'pending_customer_accept') {
      return NextResponse.json({ error: 'No hay cotización pendiente' }, { status: 400 })
    }

    // Verificar que no expiró
    if (rapiboy.pendingQuoteTimestamp) {
      const elapsed = Date.now() - new Date(rapiboy.pendingQuoteTimestamp).getTime()
      if (elapsed > ACCEPT_WINDOW_MS) {
        order.deliveryProvider!.rapiboy!.quoteStatus = 'expired'
        await order.save()
        return NextResponse.json({ error: 'La cotización expiró' }, { status: 410 })
      }
    }

    if (action === 'reject') {
      // Rechazar: marcar quoteStatus y notificar restaurante
      order.deliveryProvider!.rapiboy!.quoteStatus = 'rejected'
      await order.save()
      // 26/11/2026: el comentario decía «notificar restaurante» pero no se avisaba.
      await notifyQuoteRejected(order)

      console.log(`[rapiboy-price-accept] Order ${orderId}: client rejected new price`)

      return NextResponse.json({ success: true, action: 'rejected' })
    }

    // ── ACEPTAR: re-cotizar y crear el viaje ──
    // La cotización de Rapiboy vale 3 minutos y el cliente tiene 15 para
    // aceptar: se vuelve a cotizar siempre. Si el costo volvió a subir por
    // encima de lo que el cliente aceptó, se le muestra el nuevo (409).
    if (rapiboy.tripId) {
      return NextResponse.json({ success: true, action: 'accepted', tripId: rapiboy.tripId, trackingUrl: rapiboy.trackingUrl })
    }

    const location = await Location.findById(order.locationId)
      .select('name phone rapiboyConfig geo address deliveryConfig')
      .lean() as any

    const rapiboyCfg = location ? rapiboyConfigFromLocation(location) : null
    const tripParams = rapiboyCfg ? buildTripParams(order, location) : null
    if (!rapiboyCfg || !tripParams) {
      return NextResponse.json({ error: 'Rapiboy no disponible' }, { status: 503 })
    }

    try {
      const cotizacion = await cotizarOnDemand(tripParams.origen, tripParams.destino, rapiboyCfg)
      if (cotizacion.precio > rapiboy.pendingQuoteCost) {
        order.deliveryProvider!.rapiboy!.pendingQuoteCost = cotizacion.precio
        order.deliveryProvider!.rapiboy!.pendingQuoteTimestamp = new Date()
        await order.save()
        return NextResponse.json({
          error: 'El costo del envío cambió otra vez',
          pendingQuoteCost: cotizacion.precio,
        }, { status: 409 })
      }

      const viaje = await createTripForOrder(order, tripParams, rapiboyCfg)
      const r = order.deliveryProvider!.rapiboy!
      if (viaje) recordCreatedTrip(order, viaje)
      r.quotedCost = cotizacion.precio
      r.margin = (r.chargedToCustomer || 0) - cotizacion.precio
      r.quoteStatus = 'accepted'
      r.environment = rapiboyCfg.environment

      await order.save()

      console.log(`[rapiboy-price-accept] Order ${orderId}: client accepted, trip created: ${r.tripId}`)

      return NextResponse.json({
        success: true,
        action: 'accepted',
        tripId: r.tripId,
        trackingUrl: r.trackingUrl,
      })
    } catch (rapiboyErr: any) {
      console.error(`[rapiboy-price-accept] Error creating trip for order ${orderId}:`, rapiboyErr?.message, rapiboyErr?.apiMessage ?? '')
      return NextResponse.json({ error: 'No pudimos pedir el repartidor. Probá de nuevo en un momento.' }, { status: 502 })
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
