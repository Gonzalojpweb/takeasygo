import { connectDB } from '@/lib/mongoose'
import PlatformConfig from '@/models/PlatformConfig'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    let config = await PlatformConfig.findById('platform')
    if (!config) {
      config = await PlatformConfig.create({ _id: 'platform' })
    }

    return NextResponse.json({ qrPromoDefaults: config.qrPromoDefaults })
  } catch (error) {
    console.error('QR Promo Defaults GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const body = await request.json()
    const { 
      title, 
      subtitle, 
      buttonText, 
      termsText,
      defaultDiscountPercentage 
    } = body

    if (defaultDiscountPercentage !== undefined && (defaultDiscountPercentage < 0 || defaultDiscountPercentage > 100)) {
      return NextResponse.json({ error: 'El descuento debe estar entre 0 y 100' }, { status: 400 })
    }

    await connectDB()

    const updateData: any = {}
    if (typeof title === 'string') updateData['qrPromoDefaults.title'] = title
    if (typeof subtitle === 'string') updateData['qrPromoDefaults.subtitle'] = subtitle
    if (typeof buttonText === 'string') updateData['qrPromoDefaults.buttonText'] = buttonText
    if (typeof termsText === 'string') updateData['qrPromoDefaults.termsText'] = termsText
    if (typeof defaultDiscountPercentage === 'number') updateData['qrPromoDefaults.defaultDiscountPercentage'] = defaultDiscountPercentage

    const config = await PlatformConfig.findByIdAndUpdate(
      'platform',
      { $set: updateData },
      { new: true, upsert: true }
    )

    return NextResponse.json({ qrPromoDefaults: config?.qrPromoDefaults })
  } catch (error) {
    console.error('QR Promo Defaults PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
