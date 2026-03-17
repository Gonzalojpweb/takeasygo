// SERVER-ONLY — no importar desde componentes cliente
import { MercadoPagoConfig, PreApproval } from 'mercadopago'
import { connectDB } from '@/lib/mongoose'
import PlatformConfig from '@/models/PlatformConfig'
import { decrypt } from '@/lib/crypto'

export { BILLING_CONFIG, type BillablePlan } from '@/lib/billing-config'

export async function getPlatformMPClient() {
  await connectDB()
  const config = await PlatformConfig.findById('platform').lean() as any
  if (!config?.mercadopago?.isConfigured || !config.mercadopago.accessToken) {
    throw new Error('MercadoPago de plataforma no configurado. Configuralo en superadmin.')
  }
  const accessToken = decrypt(config.mercadopago.accessToken)
  const client = new MercadoPagoConfig({ accessToken })
  return { client, preApproval: new PreApproval(client) }
}

export async function getPlatformWebhookSecret(): Promise<string> {
  await connectDB()
  const config = await PlatformConfig.findById('platform').lean() as any
  if (!config?.mercadopago?.webhookSecret) {
    throw new Error('Webhook secret de plataforma no configurado.')
  }
  return decrypt(config.mercadopago.webhookSecret)
}
