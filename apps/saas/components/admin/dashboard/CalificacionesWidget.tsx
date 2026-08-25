'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Calificacion {
  id: string
  customerName: string
  rating: number
  comment: string
  phone: string
  orderNumber: string
  createdAt: string
}

interface CalificacionesData {
  avgRating: number
  total: number
  distribution: Record<string, number>
  calificaciones: Calificacion[]
}

function Skeleton() {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Calificaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4 animate-pulse">
            <div className="h-10 w-20 bg-muted rounded" />
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2 flex-1 bg-muted rounded-full" />
                  <div className="h-4 w-6 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={cn(
            i <= rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-300 text-gray-300'
          )}
        />
      ))}
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function CalificacionesWidget({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<CalificacionesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCalificaciones() {
      try {
        const res = await fetch(`/api/${tenantSlug}/admin/dashboard/calificaciones`)
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        setData(json)
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    fetchCalificaciones()
  }, [tenantSlug])

  if (loading) return <Skeleton />
  if (!data || data.total === 0) return null

  const maxCount = Math.max(...Object.values(data.distribution), 1)

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Calificaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Score summary */}
          <div className="space-y-4">
            <div className="text-4xl font-black">{data.avgRating.toFixed(1)}</div>
            <StarRating rating={Math.round(data.avgRating)} size={20} />
            <p className="text-sm text-muted-foreground">
              {data.total} calificacion{data.total !== 1 ? 'es' : ''}
            </p>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = data.distribution[String(stars)] ?? 0
                const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
                return (
                  <div key={stars} className="flex items-center gap-2 text-sm">
                    <span className="w-3 text-muted-foreground">{stars}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-muted-foreground">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: Recent comments */}
          <div className="space-y-4">
            {data.calificaciones.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {getInitials(c.customerName)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.customerName}</span>
                    <StarRating rating={c.rating} size={12} />
                  </div>
                  {c.comment && (
                    <p className="text-sm text-muted-foreground mt-0.5">{c.comment}</p>
                  )}
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {c.phone && <span>{c.phone}</span>}
                    {c.orderNumber && <span>#{c.orderNumber}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
