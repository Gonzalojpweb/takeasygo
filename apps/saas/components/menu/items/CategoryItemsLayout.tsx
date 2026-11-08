'use client'

import { Fragment, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { CAROUSEL_PREVIEW_LIMIT, type CategoryLayout } from '@/lib/menu-layout'

interface Props<T> {
  items: T[]
  layout: CategoryLayout
  getKey: (item: T) => string
  renderItem: (item: T, layout: CategoryLayout) => ReactNode
  primary: string
  /** Contenedor de la lista (cada vista tiene su espaciado). */
  listClassName: string
  gridClassName?: string
  previewLimit?: number
}

/**
 * Dispone los productos de una categoría (o subcategoría) según su formato.
 * El carrusel muestra los primeros productos y una tarjeta «Ver todos (N)»
 * que despliega la categoría en grilla.
 */
export function CategoryItemsLayout<T>({
  items,
  layout,
  getKey,
  renderItem,
  primary,
  listClassName,
  gridClassName = 'grid grid-cols-2 gap-3',
  previewLimit = CAROUSEL_PREVIEW_LIMIT,
}: Props<T>) {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null

  if (layout === 'list') {
    return (
      <div className={listClassName}>
        {items.map(item => <Fragment key={getKey(item)}>{renderItem(item, 'list')}</Fragment>)}
      </div>
    )
  }

  if (layout === 'grid' || expanded) {
    return (
      <div>
        <div className={gridClassName}>
          {items.map(item => <Fragment key={getKey(item)}>{renderItem(item, 'grid')}</Fragment>)}
        </div>
        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-3 text-sm font-bold"
            style={{ color: primary }}
          >
            Ver menos
          </button>
        )}
      </div>
    )
  }

  const shown = items.slice(0, previewLimit)
  const hidden = items.length - shown.length

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
      {shown.map(item => (
        <div key={getKey(item)} className="flex w-[44%] min-w-[150px] max-w-[200px] shrink-0 snap-start [&>*]:w-full">
          {renderItem(item, 'carousel')}
        </div>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-[34%] min-w-[120px] max-w-[160px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-bold transition-transform active:scale-[0.98]"
          style={{ borderColor: primary + '40', color: primary }}
          aria-label={`Ver todos los productos (${items.length})`}
        >
          <span className="grid h-10 w-10 place-items-center rounded-full" style={{ backgroundColor: primary + '14' }}>
            <ChevronRight size={20} />
          </span>
          Ver todos
          <span className="text-xs font-semibold opacity-70">({items.length})</span>
        </button>
      )}
    </div>
  )
}
