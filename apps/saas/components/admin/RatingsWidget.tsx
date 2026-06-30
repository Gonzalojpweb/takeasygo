'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'

interface RatingSummary {
  avg: number | null
  count: number
  distribution: { stars: number; count: number }[]
  recent: {
    id: string
    stars: number
    comment: string
    orderNumber: string
    createdAt: string
  }[]
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          size={size}
          className={s <= value ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'}
        />
      ))}
    </span>
  )
}

export default function RatingsWidget({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<RatingSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/ratings`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.distribution) setData(d) })
      .finally(() => setLoading(false))
  }, [tenantSlug])

  if (loading) return null
  if (!data || data.count === 0) return null

  const maxDist = Math.max(...data.distribution.map(d => d.count), 1)

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-muted/30 p-6 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10">
            <Star size={20} className="text-amber-500 fill-amber-500" />
          </div>
          <div>
            <CardTitle className="text-foreground text-base font-bold">Calificaciones</CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5 font-medium">Opiniones de clientes — solo visibles para vos</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-[0.2em] border-amber-500/40 text-amber-600 bg-amber-500/5 px-3 py-1">
          Interno
        </Badge>
      </CardHeader>

      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Score principal */}
          <div className="flex flex-col items-center justify-center gap-1 shrink-0">
            <p className="text-5xl font-black tabular-nums text-foreground">
              {data.avg?.toFixed(1)}
            </p>
            <Stars value={Math.round(data.avg ?? 0)} size={16} />
            <p className="text-xs text-muted-foreground font-medium mt-1">
              {data.count} calificación{data.count !== 1 ? 'es' : ''}
            </p>
          </div>

          {/* Distribución */}
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map(s => {
              const d = data.distribution.find(x => x.stars === s)!
              const pct = Math.round((d.count / maxDist) * 100)
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs font-bold tabular-nums text-muted-foreground w-2">{s}</span>
                  <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-3">{d.count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Últimas calificaciones con comentario */}
        {data.recent.some(r => r.comment) && (
          <div className="mt-6 space-y-3 border-t border-border/40 pt-5">
            <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">Últimos comentarios</p>
            {data.recent
              .filter(r => r.comment)
              .slice(0, 3)
              .map(r => (
                <div key={r.id} className="rounded-2xl bg-muted/40 border border-border/40 p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <Stars value={r.stars} size={12} />
                    <span className="text-[10px] font-mono text-muted-foreground">#{r.orderNumber}</span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{r.comment}</p>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
