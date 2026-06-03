import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import QrPromoView from '@/models/QrPromoView'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source') || ''
    
    // Solo mostrar promo si viene de QR (source contiene 'qr')
    if (!source.toLowerCase().includes('qr')) {
      return NextResponse.json({ show: false, reason: 'not_qr_source' })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('qrPromo loyaltyMessaging _id name')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const qrPromo = tenant.qrPromo

    // Si la promo no está habilitada
    if (!qrPromo?.isEnabled) {
      return NextResponse.json({ show: false, reason: 'not_enabled' })
    }

    // Obtener IP del visitante
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
    const userAgent = request.headers.get('user-agent') || ''

    // Si la frecuencia es 'every_visit', no bloqueamos nunca
    if (qrPromo.frequency !== 'every_visit') {
      // Verificar si ya vio la promo según la frecuencia configurada
      if (qrPromo.frequency === 'once') {
        const existingView = await QrPromoView.findOne({
          tenantId: tenant._id,
          ip,
        })

        if (existingView) {
          return NextResponse.json({ show: false, reason: 'already_viewed' })
        }
      } else if (qrPromo.frequency === 'daily') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const existingView = await QrPromoView.findOne({
          tenantId: tenant._id,
          ip,
          viewedAt: { $gte: today }
        })

        if (existingView) {
          return NextResponse.json({ show: false, reason: 'already_viewed_today' })
        }
      }
    }

    // Personalizar el texto con el descuento
    const subtitle = qrPromo.subtitle.replace('{discount}', String(qrPromo.discountPercentage))

    return NextResponse.json({
      show: true,
      promo: {
        ...qrPromo,
        subtitle,
        discountPercentage: qrPromo.discountPercentage,
      },
      loyaltyMessaging: tenant.loyaltyMessaging,
      tenantName: tenant.name,
    })
  } catch (error) {
    console.error('QR Promo GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST para registrar que el usuario vio la promo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { source } = body

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
    const userAgent = request.headers.get('user-agent') || ''

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id qrPromo')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Solo registrar si no es 'every_visit' para no saturar la DB de logs innecesarios
    if (tenant.qrPromo?.frequency !== 'every_visit') {
      await QrPromoView.create({
        tenantId: tenant._id,
        ip,
        userAgent,
        source,
        viewedAt: new Date(),
        discountPercentage: tenant.qrPromo?.discountPercentage || 0,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('QR Promo POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
