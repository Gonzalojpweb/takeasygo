import { MercadoPagoConfig, Preference } from 'mercadopago'
import { decrypt } from '@/lib/crypto'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'

export async function getMercadoPagoClient(tenantSlug: string) {
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug })
  if (!tenant) throw new Error('Tenant no encontrado')

  if (!tenant.mercadopago.isConfigured || !tenant.mercadopago.accessToken) {
    throw new Error('MercadoPago no configurado para este tenant')
  }

  const accessToken = decrypt(tenant.mercadopago.accessToken)

  const client = new MercadoPagoConfig({ accessToken })
  return { client, tenant }
}