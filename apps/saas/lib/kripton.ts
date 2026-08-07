import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'

function getKriptonBaseUrl(): string {
  const url = process.env.KRIPTON_API_URL
  if (!url) {
    throw new Error('KRIPTON_API_URL no está configurada en las variables de entorno')
  }
  return url
}

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
  const url = `${getKriptonBaseUrl()}${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
      ...(options.headers || {}),
    },
  })

  const text = await res.text()
  console.log(`[kriptonFetch] status=${res.status}`)

  if (!text) {
    throw new KriptonError(`Respuesta vacía de Kripton (status ${res.status})`, res.status)
  }

  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    throw new KriptonError(`Respuesta no JSON de Kripton: status=${res.status} body="${text.slice(0, 200)}"`, res.status)
  }

  if (!res.ok) {
    const msg = body.error?.message || body.message || `Kripton API error: ${res.status}`
    const code = body.error?.code || res.status
    throw new KriptonError(msg, code)
  }

  return body.data ?? body
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
): Promise<{ url: string; external_code: string }> {
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
