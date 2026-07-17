'use client'

import { cn } from '@/lib/utils'
import BoardCard from './BoardCard'

interface Props {
  title: string
  status: string
  color: string
  dotColor: string
  orders: any[]
  selectedOrderId: string | null
  newOrderIds: Set<string>
  onSelectOrder: (order: any) => void
}

export default function BoardColumn({ title, status, color, dotColor, orders, selectedOrderId, newOrderIds, onSelectOrder }: Props) {
  return (
    <div className="flex flex-col min-w-[220px] w-[240px] md:min-w-[260px] md:w-[280px] h-full">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full', dotColor)} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70">
            {title}
          </h3>
        </div>
        <span className={cn(
          'inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-black px-1.5',
          color
        )}>
          {orders.length}
        </span>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-2 min-h-0">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-[10px] text-muted-foreground/50 font-medium">Sin pedidos</p>
          </div>
        ) : (
          orders.map(order => (
            <BoardCard
              key={order._id}
              order={order}
              isSelected={selectedOrderId === order._id}
              isNew={newOrderIds.has(order._id)}
              onClick={() => onSelectOrder(order)}
            />
          ))
        )}
      </div>
    </div>
  )
}
