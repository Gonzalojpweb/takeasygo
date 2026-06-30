import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Rating from '@/models/Rating'
import { verifyRatingToken } from '@/lib/rating-token'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id }).lean() as any
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // El pedido debe estar entregado
    if (order.status !== 'delivered') {
      return NextResponse.json({ error: 'Solo se pueden calificar pedidos entregados' }, { status: 400 })
    }

    const body = await request.json()
    const { stars, comment, token } = body

    // Validar token HMAC
    if (!verifyRatingToken(orderId, token)) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    // Validar estrellas
    const starsN = Number(stars)
    if (!starsN || starsN < 1 || starsN > 5) {
      return NextResponse.json({ error: 'Calificación inválida (1-5)' }, { status: 400 })
    }

    // Crear rating (falla silencioso si ya existe por el unique index en orderId)
    try {
      await Rating.create({
        orderId: order._id,
        tenantId: tenant._id,
        locationId: order.locationId,
        stars: starsN,
        comment: typeof comment === 'string' ? comment.trim().slice(0, 280) : '',
      })
    } catch (e: any) {
      if (e.code === 11000) {
        return NextResponse.json({ error: 'Este pedido ya fue calificado' }, { status: 409 })
      }
      throw e
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET — verifica si un pedido es calificable (para pre-validar en la UI)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const token = new URL(request.url).searchParams.get('token') ?? ''

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) return NextResponse.json({ ratable: false, reason: 'tenant' })

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id }).lean() as any
    if (!order) return NextResponse.json({ ratable: false, reason: 'not_found' })

    if (!verifyRatingToken(orderId, token)) {
      return NextResponse.json({ ratable: false, reason: 'invalid_token' })
    }
    if (order.status !== 'delivered') {
      return NextResponse.json({ ratable: false, reason: 'not_delivered' })
    }

    const existing = await Rating.exists({ orderId: order._id })
    if (existing) return NextResponse.json({ ratable: false, reason: 'already_rated' })

    return NextResponse.json({
      ratable: true,
      orderNumber: order.orderNumber,
      tenantName: tenant.name,
    })
  } catch (error) {
    return NextResponse.json({ ratable: false, reason: 'error' })
  }
}
