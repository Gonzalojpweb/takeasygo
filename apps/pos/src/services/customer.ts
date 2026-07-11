import type { CustomerProfile } from "@takeasygo/types"

const SYNC_URL = import.meta.env.VITE_SYNC_URL;

export interface SaaSCustomer {
  id: string
  name: string
  email?: string
  phone?: string
  totalOrders?: number
  totalSpent?: number
  averageTicket?: number
  lastVisit?: string
  loyaltyPoints?: number
  segment?: string
}

export async function searchCustomers(
  query: string,
  jwt: string
): Promise<SaaSCustomer[]> {
  const res = await fetch(
    `${SYNC_URL}/api/v1/crm/customers?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Customer search failed (${res.status})`)
  }

  return res.json()
}

export function toCustomerProfile(customer: SaaSCustomer): CustomerProfile {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    totalOrders: customer.totalOrders ?? 0,
    totalSpent: customer.totalSpent ?? 0,
    averageTicket: customer.averageTicket ?? 0,
    lastVisit: customer.lastVisit ? new Date(customer.lastVisit) : undefined,
    loyaltyPoints: customer.loyaltyPoints,
    segment: customer.segment as CustomerProfile["segment"] | undefined,
  }
}
