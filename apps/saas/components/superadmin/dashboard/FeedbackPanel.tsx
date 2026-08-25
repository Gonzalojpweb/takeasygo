'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertTriangle, Star } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface FeedbackPanelProps {
  data: {
    negativosHoy: number
    totalHoy: number
    satisfaccionPct: number
    items: Array<{
      tenantName: string
      tenantSlug: string
      type: string
      stars?: number
      satisfaction?: string
      comment: string
      createdAt: string
    }>
  }
}

const SATISFACTION_COLORS: Record<string, string> = {
  excelente: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  buena: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  mejorable: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={10}
          className={cn(i < stars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30')}
        />
      ))}
    </div>
  )
}

export default function FeedbackPanel({ data }: FeedbackPanelProps) {
  const hasNegatives = data.negativosHoy > 0

  return (
    <Card className={cn(
      'bg-card border-2 shadow-lg rounded-2xl overflow-hidden',
      hasNegatives ? 'border-amber-400/40' : 'border-border/60'
    )}>
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Feedback</CardTitle>
          {hasNegatives && (
            <Badge variant="outline" className="text-[10px] font-bold bg-amber-500/10 text-amber-600 border-amber-500/20">
              <AlertTriangle size={10} className="mr-1" />
              {data.negativosHoy} negativa{data.negativosHoy !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {/* Satisfaction bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Satisfacción hoy</span>
            <span className={cn(
              'text-sm font-bold',
              data.satisfaccionPct >= 80 ? 'text-emerald-600' : data.satisfaccionPct >= 50 ? 'text-amber-600' : 'text-red-600'
            )}>
              {data.satisfaccionPct}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                data.satisfaccionPct >= 80 ? 'bg-emerald-500' : data.satisfaccionPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${data.satisfaccionPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {data.totalHoy} evento{data.totalHoy !== 1 ? 's' : ''} con feedback hoy
          </p>
        </div>

        {/* Negative items */}
        {hasNegatives && (
          <div className="space-y-2">
            {data.items
              .filter(f => f.satisfaction === 'mejorable' || (f.stars !== undefined && f.stars <= 2))
              .slice(0, 5)
              .map((item, i) => (
                <div key={i} className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground">{item.tenantName}</span>
                    <div className="flex items-center gap-2">
                      {item.stars !== undefined && <StarRating stars={item.stars} />}
                      {item.satisfaction && (
                        <Badge variant="outline" className={cn('text-[9px] font-bold px-1 py-0', SATISFACTION_COLORS[item.satisfaction])}>
                          {item.satisfaction}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {item.comment && (
                    <p className="text-xs text-muted-foreground italic">&ldquo;{item.comment}&rdquo;</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: es })}
                  </p>
                </div>
              ))}
          </div>
        )}

        {!hasNegatives && data.totalHoy === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Sin feedback hoy</p>
        )}

        {!hasNegatives && data.totalHoy > 0 && (
          <p className="text-sm text-emerald-600 py-4 text-center font-medium">
            Todo bien hoy — {data.totalHoy} evento{data.totalHoy !== 1 ? 's' : ''} sin negativos
          </p>
        )}
      </CardContent>
    </Card>
  )
}
