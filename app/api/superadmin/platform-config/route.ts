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

  return NextResponse.json({
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
  })
}

export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  const body = await request.json()
  const { accessToken, webhookSecret } = body as {
    accessToken?: string
    webhookSecret?: string
  }

  if (!accessToken && !webhookSecret) {
    return NextResponse.json({ error: 'Se requiere al menos un campo' }, { status: 400 })
  }

  await connectDB()

  const current = await PlatformConfig.findById('platform') as any

  const update: Record<string, any> = {}

  if (accessToken) {
    update['mercadopago.accessToken'] = encrypt(accessToken.trim())
  }
  if (webhookSecret) {
    update['mercadopago.webhookSecret'] = encrypt(webhookSecret.trim())
  }

  // Marcar como configurado si ambas claves existen
  const hasToken = accessToken
    ? true
    : !!current?.mercadopago?.accessToken
  const hasSecret = webhookSecret
    ? true
    : !!current?.mercadopago?.webhookSecret

  update['mercadopago.isConfigured'] = hasToken && hasSecret

  await PlatformConfig.findByIdAndUpdate(
    'platform',
    { $set: update },
    { upsert: true, new: true }
  )

  return NextResponse.json({ ok: true })
}
