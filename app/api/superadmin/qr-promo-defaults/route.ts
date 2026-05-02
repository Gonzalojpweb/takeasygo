import { connectDB } from '@/lib/mongoose'
import PlatformConfig from '@/models/PlatformConfig'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  try {
    await connectDB()

    let config = await PlatformConfig.findById('platform')
    if (!config) {
      config = await PlatformConfig.create({ _id: 'platform' })
    }

    return NextResponse.json({ qrPromoStyles: config.qrPromoStyles })
  } catch (error) {
    console.error('QR Promo Styles GET error:', error)
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
      primaryColor,
      backgroundColor,
      badgeColor,
      borderRadius,
      buttonColor
    } = body

    await connectDB()

    const updateData: any = {}
    if (typeof primaryColor === 'string') updateData['qrPromoStyles.primaryColor'] = primaryColor
    if (typeof backgroundColor === 'string') updateData['qrPromoStyles.backgroundColor'] = backgroundColor
    if (typeof badgeColor === 'string') updateData['qrPromoStyles.badgeColor'] = badgeColor
    if (typeof borderRadius === 'string') updateData['qrPromoStyles.borderRadius'] = borderRadius
    if (typeof buttonColor === 'string') updateData['qrPromoStyles.buttonColor'] = buttonColor

    const config = await PlatformConfig.findByIdAndUpdate(
      'platform',
      { $set: updateData },
      { new: true, upsert: true }
    )

    return NextResponse.json({ qrPromoStyles: config?.qrPromoStyles })
  } catch (error) {
    console.error('QR Promo Styles PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
