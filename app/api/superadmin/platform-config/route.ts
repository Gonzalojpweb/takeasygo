import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import PlatformConfig from '@/models/PlatformConfig'
import { encrypt, decrypt } from '@/lib/crypto'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()
  const config = await PlatformConfig.findById('platform').lean() as any

  const mp = config?.mercadopago ?? {}
  const mpOAuth = config?.mpOAuth ?? {}

  return NextResponse.json({
    mercadopago: {
      isConfigured: !!mp.isConfigured,
      hasAccessToken: !!mp.accessToken,
      hasWebhookSecret: !!mp.webhookSecret,
      // Mostrar sufijo enmascarado si existe
      accessTokenHint: mp.accessToken
        ? '••••••••' + decrypt(mp.accessToken).slice(-6)
        : null,
      webhookSecretHint: mp.webhookSecret
        ? '••••••••' + decrypt(mp.webhookSecret).slice(-6)
        : null,
    },
    mpOAuth: {
      appId: mpOAuth.appId || null,
      appSecretHint: mpOAuth.appSecret
        ? '••••••••' + decrypt(mpOAuth.appSecret).slice(-6)
        : null,
      redirectUri: mpOAuth.redirectUri || null,
      platformFeePercent: mpOAuth.platformFeePercent || 5,
      isConfigured: !!(mpOAuth.appId && mpOAuth.appSecret && mpOAuth.redirectUri),
    },
  })
}

export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  const body = await request.json()
  const { accessToken, webhookSecret, mpOAuth } = body as {
    accessToken?: string
    webhookSecret?: string
    mpOAuth?: {
      appId?: string
      appSecret?: string
      redirectUri?: string
      platformFeePercent?: number
    }
  }

  await connectDB()

  const current = await PlatformConfig.findById('platform') as any

  const update: Record<string, any> = {}

  // MercadoPago credentials (existing)
  if (accessToken) {
    update['mercadopago.accessToken'] = encrypt(accessToken.trim())
  }
  if (webhookSecret) {
    update['mercadopago.webhookSecret'] = encrypt(webhookSecret.trim())
  }

  // OAuth configuration (new)
  if (mpOAuth) {
    if (mpOAuth.appId) {
      update['mpOAuth.appId'] = mpOAuth.appId.trim()
    }
    if (mpOAuth.appSecret) {
      update['mpOAuth.appSecret'] = encrypt(mpOAuth.appSecret.trim())
    }
    if (mpOAuth.redirectUri) {
      update['mpOAuth.redirectUri'] = mpOAuth.redirectUri.trim()
    }
    if (mpOAuth.platformFeePercent !== undefined) {
      update['mpOAuth.platformFeePercent'] = mpOAuth.platformFeePercent
    }
  }

  // Marcar mercadopago como configurado si ambas claves existen
  const hasToken = accessToken ? true : !!current?.mercadopago?.accessToken
  const hasSecret = webhookSecret ? true : !!current?.mercadopago?.webhookSecret
  update['mercadopago.isConfigured'] = hasToken && hasSecret

  await PlatformConfig.findByIdAndUpdate(
    'platform',
    { $set: update },
    { upsert: true, new: true }
  )

  return NextResponse.json({ ok: true })
}
