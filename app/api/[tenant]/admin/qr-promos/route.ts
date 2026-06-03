import { connectDB } from '@/lib/mongoose'
import QrPromo from '@/models/QrPromo'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params

    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id qrPromo')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const promos = await QrPromo.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).lean()

    return NextResponse.json({ promos, legacyQrPromo: tenant.qrPromo })
  } catch (error) {
    console.error('QR Promos GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params

    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const body = await request.json()

    if (!body.slug || typeof body.slug !== 'string') {
      return NextResponse.json({ error: 'slug es requerido' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const slug = body.slug.toLowerCase().trim()

    const existing = await QrPromo.findOne({ tenantId: tenant._id, slug })
    if (existing) {
      return NextResponse.json({ error: `Ya existe una promo con slug "${slug}"` }, { status: 409 })
    }

    const promo = await QrPromo.create({
      tenantId: tenant._id,
      slug,
      isEnabled: body.isEnabled ?? false,
      type: body.type ?? 'discount',
      discountPercentage: body.discountPercentage ?? 15,
      frequency: body.frequency ?? 'once',
      title: body.title ?? '¡Primera vez por QR!',
      subtitle: body.subtitle ?? 'Obtené {discount}% OFF en tu primer pedido takeaway',
      buttonText: body.buttonText ?? 'Ver menú',
      termsText: body.termsText ?? 'Válido solo para pedidos takeaway. No acumulable con otras promociones.',
      imageUrl: body.imageUrl ?? '',
      badgeLabel: body.badgeLabel ?? 'SOLO POR HOY',
      offLabel: body.offLabel ?? 'OFF',
      takeawayWarningTitle: body.takeawayWarningTitle ?? 'DESCUENTO EXCLUSIVO PARA TAKEAWAY',
      takeawayWarningText: body.takeawayWarningText ?? 'No aplicable para consumir en el local',
      loadingText: body.loadingText ?? 'Procesando...',
      checkoutDiscountLabel: body.checkoutDiscountLabel ?? 'Descuento QR',
    })

    return NextResponse.json({ promo }, { status: 201 })
  } catch (error) {
    console.error('QR Promos POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
