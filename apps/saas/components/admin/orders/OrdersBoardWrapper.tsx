'use client'

import { OperationsBoard, type BoardColumnDef, type BoardItem } from '@/components/shared/operations-board'
import OrderCard from './OrderCard'
import OrderContextPanel from './OrderContextPanel'
import OrderInsights from './OrderInsights'

interface OrderItem extends BoardItem {
  orderNumber: string
  customer: { name: string; phone?: string; email?: string; phoneHash?: string }
  orderMode?: string
  total: number
  locationId?: string
  locationName?: string
  orderTiming?: string
  scheduledPickupAt?: string
  deliveryAddress?: any
  items?: any[]
  notes?: string
  statusTimestamps?: Record<string, string>
  posSync?: { status?: string }
}

const ORDER_COLUMNS: BoardColumnDef[] = [
  { status: 'pending',    title: 'Pendientes',   dotColor: 'bg-amber-400',  color: 'bg-amber-100 text-amber-700' },
  { status: 'confirmed',  title: 'Confirmados',  dotColor: 'bg-blue-500',   color: 'bg-blue-100 text-blue-700' },
  { status: 'preparing',  title: 'Preparando',    dotColor: 'bg-orange-400', color: 'bg-orange-100 text-orange-700' },
  { status: 'ready',      title: 'Listos',        dotColor: 'bg-emerald-500', color: 'bg-emerald-100 text-emerald-700' },
  { status: 'en_ruta',    title: 'En Ruta',       dotColor: 'bg-sky-500',   color: 'bg-sky-100 text-sky-700' },
  { status: 'delivered',  title: 'Entregados',    dotColor: 'bg-zinc-400',  color: 'bg-zinc-100 text-zinc-600' },
]

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived']
const ALERT_STATUSES = ['pending', 'confirmed']

interface Props {
  orders: OrderItem[]
  tenantSlug: string
  locations?: { _id: string; name: string }[]
  userAssignedLocations?: string[]
}

export default function OrdersBoardWrapper({ orders, tenantSlug, locations = [], userAssignedLocations = [] }: Props) {
  const isAdmin = userAssignedLocations.length === 0
  const availableLocations = isAdmin ? locations : locations.filter(l => userAssignedLocations.includes(l._id))

  const handleCleanup = async () => {
    const res = await fetch(`/api/${tenantSlug}/orders/cleanup-cancelled`, { method: 'POST' })
    if (!res.ok) throw new Error()
    const data = await res.json()
    const { toast } = await import('sonner')
    toast.success(data.message || 'Limpieza completada')
  }

  return (
    <OperationsBoard
      items={orders}
      columns={ORDER_COLUMNS}
      tenantSlug={tenantSlug}
      activeStatuses={ACTIVE_STATUSES}
      alertStatuses={ALERT_STATUSES}
      searchConfig={{
        getSearchFields: (item) => [
          item.orderNumber,
          item.customer.name,
          item.customer.phone || '',
        ],
      }}
      locationConfig={{
        locations: availableLocations,
        userAssignedLocations,
      }}
      renderCard={(props) => <OrderCard {...props} />}
      renderContextPanel={(props) => <OrderContextPanel {...props} />}
      renderInsights={(props) => <OrderInsights {...props} />}
      onCleanup={handleCleanup}
      soundSrc="/sounds/new-order.mp3"
      getNewItemToast={(items) => ({
        title: items.length === 1 ? 'Nuevo pedido' : `${items.length} nuevos pedidos`,
        description: items.map(o => `#${o.orderNumber} · ${o.customer.name}`).join(' — '),
      })}
    />
  )
}
