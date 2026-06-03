import { connectDB } from '@/lib/mongoose'
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

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('qrPromo name slug')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json({
      qrPromo: tenant.qrPromo,
      tenantName: tenant.name,
    })
  } catch (error) {
    console.error('QR Promo GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
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
    
    // Validar datos
    const { 
      isEnabled, 
      discountPercentage, 
      frequency,
      title,
      subtitle,
      buttonText,
      termsText,
      imageUrl,
      badgeLabel,
      offLabel,
      takeawayWarningTitle,
      takeawayWarningText,
      loadingText,
      checkoutDiscountLabel,
    } = body

    if (discountPercentage !== undefined && (discountPercentage < 0 || discountPercentage > 100)) {
      return NextResponse.json({ error: 'El descuento debe estar entre 0 y 100' }, { status: 400 })
    }

    await connectDB()

    const updateData: any = {}
    
    if (typeof isEnabled === 'boolean') updateData['qrPromo.isEnabled'] = isEnabled
    if (body.type && ['discount', 'info', 'loyalty'].includes(body.type)) {
      updateData['qrPromo.type'] = body.type
    }
    if (typeof discountPercentage === 'number') updateData['qrPromo.discountPercentage'] = discountPercentage
    if (frequency && ['once', 'every_visit', 'daily'].includes(frequency)) {
      updateData['qrPromo.frequency'] = frequency
    }
    if (typeof title === 'string') updateData['qrPromo.title'] = title
    if (typeof subtitle === 'string') updateData['qrPromo.subtitle'] = subtitle
    if (typeof buttonText === 'string') updateData['qrPromo.buttonText'] = buttonText
    if (typeof termsText === 'string') updateData['qrPromo.termsText'] = termsText
    if (typeof imageUrl === 'string') updateData['qrPromo.imageUrl'] = imageUrl
    if (typeof badgeLabel === 'string') updateData['qrPromo.badgeLabel'] = badgeLabel
    if (typeof offLabel === 'string') updateData['qrPromo.offLabel'] = offLabel
    if (typeof takeawayWarningTitle === 'string') updateData['qrPromo.takeawayWarningTitle'] = takeawayWarningTitle
    if (typeof takeawayWarningText === 'string') updateData['qrPromo.takeawayWarningText'] = takeawayWarningText
    if (typeof loadingText === 'string') updateData['qrPromo.loadingText'] = loadingText
    if (typeof checkoutDiscountLabel === 'string') updateData['qrPromo.checkoutDiscountLabel'] = checkoutDiscountLabel

    const tenant = await Tenant.findOneAndUpdate(
      { slug: tenantSlug },
      { $set: updateData },
      { new: true, select: 'qrPromo' }
    )

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json({ qrPromo: tenant.qrPromo })
  } catch (error) {
    console.error('QR Promo PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
