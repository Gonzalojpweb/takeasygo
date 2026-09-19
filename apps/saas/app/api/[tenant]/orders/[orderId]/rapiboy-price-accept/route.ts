// Endpoint público para que el cliente acepte o rechace el nuevo precio de Rapiboy
// POST: accept (aceptar) o reject (rechazar)
// GET: status (consultar estado de la cotización)
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { crearViajeOnDemand } from '@/lib/rapiboy/client'
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

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('deliveryProvider payment.status payment.method orderNumber')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

      console.log(`[rapiboy-price-accept] Order ${orderId}: client rejected new price`)

      return NextResponse.json({ success: true, action: 'rejected' })
    }

    // ── ACEPTAR: crear viaje Rapiboy ──
    const location = await Location.findById(order.locationId)
      .select('rapiboyConfig geo address deliveryConfig')
      .lean() as any

    if (!location?.rapiboyConfig?.enabled) {
      return NextResponse.json({ error: 'Rapiboy no disponible' }, { status: 500 })
    }

    const rapiboyCfg = {
      apiToken: location.rapiboyConfig.apiToken,
      environment: location.rapiboyConfig.environment as 'production' | 'uat',
      codigoPlataforma: location.rapiboyConfig.codigoPlataforma,
    }

    const origen = {
      lat: location.geo?.coordinates?.[1] ?? 0,
      lng: location.geo?.coordinates?.[0] ?? 0,
      address: location.address || '',
    }
    const destino = {
      lat: order.deliveryAddress.coordinates.lat,
      lng: order.deliveryAddress.coordinates.lng,
      address: `${order.deliveryAddress.street} ${order.deliveryAddress.number}, ${order.deliveryAddress.city}`,
    }

    try {
      const viaje = await crearViajeOnDemand({
        orderNumber: String(order.orderNumber || orderId),
        origen,
        destino,
        customerName: order.customer?.name || 'Cliente',
        customerPhone: order.customer?.phone || '',
        observaciones: order.notes || '',
        tiempoCocina: 0,
      }, rapiboyCfg)

      // Actualizar pedido con el nuevo precio
      const newCost = rapiboy.pendingQuoteCost

      order.deliveryProvider!.rapiboy!.tripId = viaje.tripId
      order.deliveryProvider!.rapiboy!.trackingId = viaje.trackingId
      order.deliveryProvider!.rapiboy!.trackingUrl = viaje.trackingUrl
      order.deliveryProvider!.rapiboy!.quotedCost = newCost
      order.deliveryProvider!.rapiboy!.margin = newCost - rapiboy.checkoutCost
      order.deliveryProvider!.rapiboy!.quoteStatus = 'accepted'
      order.deliveryProvider!.rapiboy!.environment = rapiboyCfg.environment

      await order.save()

      console.log(`[rapiboy-price-accept] Order ${orderId}: client accepted, trip created: ${viaje.tripId}`)

      return NextResponse.json({
        success: true,
        action: 'accepted',
        tripId: viaje.tripId,
        trackingUrl: viaje.trackingUrl,
      })
    } catch (rapiboyErr) {
      console.error(`[rapiboy-price-accept] Error creating trip for order ${orderId}:`, rapiboyErr)
      return NextResponse.json({ error: 'Error al crear el viaje' }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
