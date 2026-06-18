import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'

const KRIPTON_BASE_URL = 'https://app.kriptonmarket.com'

export class KriptonError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.code = code
    this.name = 'KriptonError'
  }
}

async function kriptonFetch(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${KRIPTON_BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
      ...(options.headers || {}),
    },
  })

  const body = await res.json()

  if (!res.ok || body.result !== 'ok') {
    const msg = body.error?.message || `Kripton API error: ${res.status}`
    const code = body.error?.code || res.status
    throw new KriptonError(msg, code)
  }

  return body.data
}

export async function getKriptonClient(tenantSlug: string) {
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug })
  if (!tenant) throw new Error('Tenant no encontrado')

  if (!tenant.kripton?.isConfigured || !tenant.kripton?.apiKey) {
    throw new Error('Kripton no configurado para este tenant')
  }

  const apiKey = decrypt(tenant.kripton.apiKey)
  return { apiKey, tenant }
}

export async function createPaymentLink(
  apiKey: string,
  params: {
    amount: number
    currency_id: string
    success_url: string
    cancel_url: string
    notify_url: string
    minutes_to_expire?: number
    description?: string
  }
): Promise<{ url: string; token: string }> {
  const data = await kriptonFetch(apiKey, '/hooks/payment-links', {
    method: 'POST',
    body: JSON.stringify({
      amount: params.amount,
      currency_id: params.currency_id,
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      notify_url: params.notify_url,
      minutes_to_expire: params.minutes_to_expire ?? 30,
      description: params.description || '',
    }),
  })
  return { url: data.url, token: data.token }
}

export async function createPayment(
  apiKey: string,
  params: {
    crypto_network_id: number
    amount: number
    fiat: string
    description: string
    success_url: string
    cancel_url: string
    notify_url: string
  }
): Promise<{ url: string; external_code: string; address?: string }> {
  const data = await kriptonFetch(apiKey, '/hooks/payments', {
    method: 'POST',
    body: JSON.stringify({
      crypto_network_id: params.crypto_network_id,
      amount: params.amount,
      fiat: params.fiat,
      description: params.description,
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      notify_url: params.notify_url,
    }),
  })
  return {
    url: data.url,
    external_code: data.external_code,
    address: data.address,
  }
}

export async function getPayment(
  apiKey: string,
  externalCode: string,
  token?: string
): Promise<{
  id: number
  total_amount: number | null
  state: string
  description: string | null
  created_at: string
  payed_at: string | null
  currency: string | null
  metadata: string | null
  gateway: string | null
}> {
  const query = new URLSearchParams({ external_code: externalCode })
  if (token) query.set('token', token)

  const data = await kriptonFetch(apiKey, `/hooks/payments?${query.toString()}`, {
    method: 'GET',
  })
  return data
}

export async function getCryptoNetworks(
  apiKey: string
): Promise<Array<{
  id: number
  name: string
  currency_name: string
  allow: boolean
}>> {
  const data = await kriptonFetch(apiKey, '/hooks/config/crypto_networks/merchant', {
    method: 'GET',
  })
  return data.crypto_networks || []
}

export async function getPaymentLink(
  apiKey: string,
  paymentLinkToken: string
): Promise<{
  id: number
  amount: number | null
  state: string
  expired_at: string | null
  created_at: string
  currency_id: string | null
  token: string
}> {
  const data = await kriptonFetch(apiKey, `/hooks/payment-links/${paymentLinkToken}`, {
    method: 'GET',
  })
  return data
}
