/**
 * lib/pos/fudo-connector.ts
 *
 * Conector para FUDO POS.
 * Implementa la interfaz POSConnector usando la API Beta de Inyección de Pedidos de FUDO.
 *
 * Documentación de referencia: https://ayuda.fu.do (API de Aplicaciones Externas)
 * Autenticación: client_id + client_secret → access_token temporal (Bearer)
 *
 * Eventos webhook que FUDO envía:
 *   ORDER-CONFIRMED         → confirmed
 *   ORDER-REJECTED          → cancelled
 *   ORDER-READY-TO-DELIVER  → ready
 *   ORDER-DELIVERY-SENT     → delivered (delivery)
 *   ORDER-CLOSED            → delivered (takeaway)
 */

import type {
  POSConnector,
  POSCredentials,
  POSCatalogItem,
  POSOrderPayload,
  POSOrderResult,
} from './types'
import type { OrderStatus } from '@/models/Order'

// ── Configuración ──────────────────────────────────────────────────────────────

const FUDO_BASE_URL = 'https://api.fu.do/v1'
const FUDO_TOKEN_TTL_MS = 55 * 60 * 1000  // 55 minutos (los tokens duran ~1h en FUDO)

// ── Cache de tokens por tenant (proceso) ──────────────────────────────────────
// En producción con múltiples instancias esto debería estar en Redis,
// pero para la Fase 1 el cache en memoria es suficiente.

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

// ── Mapeo de eventos FUDO → estados TakeasyGO ─────────────────────────────────

const FUDO_EVENT_MAP: Record<string, OrderStatus> = {
  'ORDER-CONFIRMED':         'confirmed',
  'ORDER-REJECTED':          'cancelled',
  'ORDER-READY-TO-DELIVER':  'ready',
  'ORDER-DELIVERY-SENT':     'delivered',
  'ORDER-CLOSED':            'delivered',
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function fetchFudoToken(credentials: POSCredentials): Promise<string> {
  const baseUrl = credentials.apiEndpoint || FUDO_BASE_URL
  const cacheKey = `${credentials.clientId}:${baseUrl}`

  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  const response = await fetch(`${baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`FUDO auth failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  const token = data.access_token as string

  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + FUDO_TOKEN_TTL_MS,
  })

  return token
}

async function fudoRequest(
  path: string,
  credentials: POSCredentials,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = credentials.apiEndpoint || FUDO_BASE_URL
  const token = await fetchFudoToken(credentials)

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
}

// ── Implementación del conector ───────────────────────────────────────────────

export const FudoConnector: POSConnector = {

  async testConnection(credentials): Promise<boolean> {
    try {
      const response = await fudoRequest('/products', credentials, { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  },

  async getCatalog(credentials): Promise<POSCatalogItem[]> {
    const response = await fudoRequest('/products', credentials, { method: 'GET' })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`FUDO getCatalog failed (${response.status}): ${body}`)
    }

    const data = await response.json()

    // La API de FUDO devuelve un array de categorías con items anidados.
    // Normalizamos a una lista plana de POSCatalogItem.
    const items: POSCatalogItem[] = []

    const categories = Array.isArray(data) ? data : (data.categories ?? data.products ?? [])

    for (const category of categories) {
      const categoryName = category.name ?? category.category_name ?? 'Sin categoría'
      const categoryItems = category.items ?? category.products ?? (category.posItemId ? [category] : [])

      for (const item of categoryItems) {
        items.push({
          posItemId:    String(item.id ?? item.product_id ?? item.posItemId),
          name:         item.name ?? item.product_name ?? '',
          price:        Number(item.price ?? item.unit_price ?? 0),
          categoryName,
          available:    item.available !== false && item.is_available !== false,
        })
      }
    }

    return items
  },

  async injectOrder(order, credentials): Promise<POSOrderResult> {
    // Construir el payload según el formato de la API de inyección de FUDO
    const payload = {
      external_id:   order.externalId,
      order_type:    'takeaway',
      customer: {
        name:  order.customer.name,
        phone: order.customer.phone ?? '',
      },
      items: order.items.map(item => ({
        product_id: item.posItemId,
        name:       item.name,
        quantity:   item.quantity,
        unit_price: item.unitPrice,
        notes:      item.notes ?? '',
        modifiers:  (item.modifiers ?? []).map(m => ({
          name:        m.name,
          extra_price: m.extraPrice,
        })),
      })),
      notes:          order.notes ?? '',
      total:          order.total,
      payment_method: order.paymentMethod,
      payment_status: 'paid',  // MercadoPago ya aprobó — siempre llega como pagado
    }

    let response: Response
    try {
      response = await fudoRequest('/orders', credentials, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } catch (networkError: any) {
      return {
        success: false,
        posOrderId: null,
        error: `Error de red al contactar FUDO: ${networkError.message}`,
      }
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        success: false,
        posOrderId: null,
        error: `FUDO rechazó la inyección (${response.status}): ${body}`,
        rawResponse: body,
      }
    }

    const data = await response.json()

    return {
      success: true,
      posOrderId: String(data.id ?? data.order_id ?? data.external_id ?? ''),
      error: null,
      rawResponse: data,
    }
  },

  mapEventToOrderStatus(event: string): OrderStatus | null {
    return FUDO_EVENT_MAP[event] ?? null
  },
}
