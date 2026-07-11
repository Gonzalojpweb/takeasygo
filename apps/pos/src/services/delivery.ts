const SYNC_URL = import.meta.env.VITE_SYNC_URL;

export interface DeliveryPerson {
  id: string
  name: string
  phone?: string
  isAvailable: boolean
  currentOrderId?: string
  vehicle?: string
}

export interface DeliveryOrder {
  id: string
  tenantId: string
  status: string
  items: Array<{ name: string; quantity: number }>
  total: number
  address?: string
  customerName?: string
  createdAt: string
}

export async function fetchDeliveryPersons(
  _tenantId: string,
  jwt: string
): Promise<DeliveryPerson[]> {
  const res = await fetch(`${SYNC_URL}/api/v1/delivery/persons`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Delivery persons fetch failed (${res.status})`)
  }

  return res.json()
}

export async function fetchAvailableDeliveryOrders(
  _tenantId: string,
  jwt: string
): Promise<DeliveryOrder[]> {
  const res = await fetch(`${SYNC_URL}/api/v1/delivery/orders`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Delivery orders fetch failed (${res.status})`)
  }

  return res.json()
}

export async function assignDeliveryPerson(
  orderId: string,
  personId: string,
  jwt: string
): Promise<void> {
  const res = await fetch(`${SYNC_URL}/api/v1/delivery/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ orderId, personId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Delivery assign failed (${res.status})`)
  }
}
