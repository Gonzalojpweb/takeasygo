'use client'

import { useState, useEffect } from 'react'
import { ShoppingBag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'

interface Props {
  tenantSlug: string
}

interface Order {
  _id: string
  orderNumber: string
  customer: { name: string }
  total: number
  status: string
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-primary/10 text-primary border-primary/20',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'Pendiente',
  confirmed: 'Confirmado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export default function PedidosRecientes({ tenantSlug }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/admin/dashboard/pedidos-recientes`)
      .then((res) => res.json())
      .then((data) => setOrders(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantSlug])

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag size={16} className="text-muted-foreground" />
          Pedidos Recientes
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sin pedidos recientes</p>
        ) : (
          <div className="divide-y divide-border/60">
            {orders.map((order) => (
              <div key={order._id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                    {order.orderNumber.slice(-2)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      #{order.orderNumber}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {order.customer.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    ${toPesos(order.total).toLocaleString('es-AR')}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] font-semibold px-1.5 py-0 border',
                      STATUS_STYLES[order.status] ?? 'bg-muted text-muted-foreground'
                    )}
                  >
                    {STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
