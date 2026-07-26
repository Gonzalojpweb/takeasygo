'use client'

import { useState } from 'react'
import { Star, MessageSquare, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Rating {
  _id: string
  stars: number
  comment: string
  createdAt: string
  orderNumber: string
  customerName: string
}

interface Props {
  initialRatings: Rating[]
}

const STAR_FILTERS = [
  { value: 0, label: 'Todas' },
  { value: 5, label: '5' },
  { value: 4, label: '4' },
  { value: 3, label: '3' },
  { value: 2, label: '2' },
  { value: 1, label: '1' },
]

export default function ReviewsClient({ initialRatings }: Props) {
  const [starFilter, setStarFilter] = useState(0)

  const filtered = starFilter === 0
    ? initialRatings
    : initialRatings.filter(r => r.stars === starFilter)

  const avgStars = initialRatings.length > 0
    ? (initialRatings.reduce((sum, r) => sum + r.stars, 0) / initialRatings.length).toFixed(1)
    : '—'

  return (
    <>
      {/* Summary */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="rounded-xl bg-primary/5 p-4 flex items-center gap-3">
          <Star size={20} className="text-primary fill-primary" />
          <div>
            <p className="text-2xl font-black text-primary tabular-nums">{avgStars}</p>
            <p className="text-[10px] font-bold uppercase text-primary/60">
              {initialRatings.length} reseña{initialRatings.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Star filter */}
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-muted-foreground" />
          {STAR_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStarFilter(f.value)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                starFilter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f.value > 0 && <span className="mr-0.5">★</span>}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rating list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <MessageSquare size={22} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground">
            {starFilter > 0 ? 'Sin reseñas con ese filtro' : 'Sin reseñas aún'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Las reseñas de tus clientes aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rating => (
            <div
              key={rating._id}
              className="rounded-xl border border-border/50 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground">#{rating.orderNumber}</span>
                  <span className="text-xs text-muted-foreground">{rating.customerName}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star
                      key={s}
                      size={12}
                      className={cn(
                        'transition-colors',
                        s <= rating.stars
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-muted-foreground/30'
                      )}
                    />
                  ))}
                </div>
              </div>
              {rating.comment && (
                <p className="text-xs text-foreground/70 leading-relaxed">{rating.comment}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {new Date(rating.createdAt).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
