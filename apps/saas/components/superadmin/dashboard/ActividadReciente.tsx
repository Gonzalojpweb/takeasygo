'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ShoppingCart, CheckCircle, XCircle, UserPlus } from 'lucide-react'
import Link from 'next/link'

interface ActividadRecienteProps {
  items: Array<{
    type: string
    tenantName: string
    tenantSlug: string
    message: string
    timestamp: string
  }>
}

const TYPE_CONFIG: Record<string, { icon: typeof ShoppingCart; color: string }> = {
  order_created: { icon: ShoppingCart, color: 'text-blue-500' },
  order_confirmed: { icon: CheckCircle, color: 'text-emerald-500' },
  order_delivered: { icon: CheckCircle, color: 'text-emerald-600' },
  order_cancelled: { icon: XCircle, color: 'text-red-500' },
  first_purchase: { icon: UserPlus, color: 'text-violet-500' },
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export default function ActividadReciente({ items }: ActividadRecienteProps) {
  if (items.length === 0) {
    return (
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
        <CardHeader className="p-4 md:p-6 pb-2">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Actividad Reciente</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <p className="text-sm text-muted-foreground py-4 text-center">Sin actividad reciente</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Actividad Reciente</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {items.slice(0, 12).map((item, i) => {
            const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.order_created
            const Icon = config.icon
            return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-muted-foreground font-mono tabular-nums w-10 shrink-0">
                  {timeAgo(item.timestamp)}
                </span>
                <Icon size={12} className={cn('shrink-0', config.color)} />
                <div className="min-w-0 flex-1">
                  {item.tenantSlug ? (
                    <Link
                      href={`/${item.tenantSlug}/admin/orders`}
                      className="text-sm text-foreground hover:text-primary truncate block"
                    >
                      {item.message}
                    </Link>
                  ) : (
                    <span className="text-sm text-foreground truncate block">{item.message}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
