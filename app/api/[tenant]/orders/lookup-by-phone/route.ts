import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { hashPhone } from '@/lib/crypto'

const rateLimit = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60_000

function checkRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now()
  const entry = rateLimit.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true }
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false }
  entry.count++
  return { allowed: true }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(ip).allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Esperá un minuto e intentá de nuevo.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const phone = req.nextUrl.searchParams.get('phone')
    if (!phone || phone.replace(/\D/g, '').length < 6) {
      return NextResponse.json({ error: 'Ingresá un número de teléfono válido' }, { status: 400 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const phoneHash = hashPhone(phone)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const orders = await Order.find({
      tenantId: tenant._id,
      'customer.phoneHash': phoneHash,
      createdAt: { $gte: sevenDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderNumber status createdAt orderMode')
      .lean()

    return NextResponse.json({
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        createdAt: o.createdAt,
        orderMode: o.orderMode,
        trackingUrl: `/${tenantSlug}/tracking/${o.orderNumber}`,
      })),
    })
  } catch (error: any) {
    console.error('[lookup-by-phone] error:', error)
    return NextResponse.json({ error: 'Error al buscar pedidos' }, { status: 500 })
  }
}
