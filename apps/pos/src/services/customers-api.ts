// ─────────────────────────────────────────────────────────────────────────────
// customers-api.ts — API de clientes para el ROS vía Sync Layer
// ─────────────────────────────────────────────────────────────────────────────
// El ROS llama al Sync Layer, que busca en MongoDB y descifra vía /internal/decrypt.

const SYNC_URL = "http://localhost:3001"

// ── Types ────────────────────────────────────────────────────────────────────

export interface CustomerSearchResult {
  customerId: string
  name: string
  phone?: string
  email?: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: string | null
  isLoyaltyMember: boolean
  segment?: string | null
  healthScore?: number | null
}

export interface CreateCustomerInput {
  name: string
  phone?: string
  email?: string
}

export interface UpdateCustomerInput {
  name?: string
  phone?: string
  email?: string
}

export interface CustomerSearchResponse {
  customers: CustomerSearchResult[]
  total: number
}

export interface CustomerOrder {
  _id: string
  orderNumber: string
  status: string
  total: number
  items: { name: string; price: number; quantity: number; subtotal: number }[]
  createdAt: string
}

export interface CustomerOrdersResponse {
  orders: CustomerOrder[]
  total: number
  page: number
  totalPages: number
}

// ── API calls ────────────────────────────────────────────────────────────────

/**
 * Buscar clientes por nombre o teléfono.
 * @param query - Texto de búsqueda (nombre o teléfono)
 * @param jwt - JWT de autenticación del POS
 */
export async function searchCustomers(
  query: string,
  jwt: string
): Promise<CustomerSearchResponse> {
  const params = new URLSearchParams({ q: query })
  const res = await fetch(`${SYNC_URL}/api/v1/customers/search?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Customer search failed (${res.status})`)
  }

  return res.json()
}

/**
 * Obtener historial de órdenes de un cliente.
 * @param customerId - ID del cliente (UUID)
 * @param jwt - JWT de autenticación del POS
 * @param page - Página (default 1)
 * @param limit - Límite por página (default 10)
 */
export async function getCustomerOrders(
  customerId: string,
  jwt: string,
  page: number = 1,
  limit: number = 10
): Promise<CustomerOrdersResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  const res = await fetch(
    `${SYNC_URL}/api/v1/customers/${customerId}/orders?${params}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Customer orders failed (${res.status})`)
  }

  return res.json()
}

/**
 * Crear un nuevo cliente desde el POS.
 */
export async function createCustomer(
  input: CreateCustomerInput,
  jwt: string
): Promise<{ customerId: string; name: string; phone?: string; email?: string }> {
  const res = await fetch(`${SYNC_URL}/api/v1/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Create customer failed (${res.status})`)
  }

  return res.json()
}

/**
 * Actualizar un cliente existente desde el POS.
 */
export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput,
  jwt: string
): Promise<{ customerId: string; name: string; phone?: string; email?: string }> {
  const res = await fetch(`${SYNC_URL}/api/v1/customers/${customerId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Update customer failed (${res.status})`)
  }

  return res.json()
}
