'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { BoardColumnDef, BoardItem } from './types'

interface BoardColumnProps<T extends BoardItem> {
  column: BoardColumnDef
  items: T[]
  selectedItemId: string | null
  newItemIds: Set<string>
  escalatedIds: Set<string>
  onSelectItem: (item: T) => void
  renderCard: (props: { item: T; isSelected: boolean; isNew: boolean; isEscalated: boolean; onClick: () => void }) => ReactNode
}

export default function BoardColumn<T extends BoardItem>({
  column,
  items,
  selectedItemId,
  newItemIds,
  escalatedIds,
  onSelectItem,
  renderCard,
}: BoardColumnProps<T>) {
  return (
    <div className="flex flex-col min-w-[220px] w-[240px] md:min-w-[260px] md:w-[280px] h-full">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full', column.dotColor)} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70">
            {column.title}
          </h3>
        </div>
        <span className={cn(
          'inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-black px-1.5',
          column.color
        )}>
          {items.length}
        </span>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-2 min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-[10px] text-muted-foreground/50 font-medium">Sin items</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item._id}>
              {renderCard({
                item,
                isSelected: selectedItemId === item._id,
                isNew: newItemIds.has(item._id),
                isEscalated: escalatedIds.has(item._id),
                onClick: () => onSelectItem(item),
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
