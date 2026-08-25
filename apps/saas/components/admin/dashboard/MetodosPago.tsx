'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toPesos } from '@takeasygo/business'
import { cn } from '@/lib/utils'

interface MetodosPagoProps {
  tenantSlug: string
}

interface MetodoPago {
  method: string
  revenue: number
  orderCount: number
}

const METHOD_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  mercadopago: { label: 'MercadoPago', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  transfer: { label: 'Transferencia', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  kripton: { label: 'Kripton', color: 'text-purple-600', bg: 'bg-purple-500/10' },
}

const METHOD_INITIALS: Record<string, string> = {
  mercadopago: 'MP',
  transfer: 'TR',
  kripton: 'KR',
}

function fmtPesos(cents: number) {
  return `$${toPesos(cents).toLocaleString('es-AR')}`
}

export default function MetodosPago({ tenantSlug }: MetodosPagoProps) {
  const [data, setData] = useState<MetodoPago[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchMetodos() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/${tenantSlug}/admin/dashboard/metodos-pago`)
        if (!res.ok) throw new Error('Error al cargar métodos de pago')
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Error al cargar métodos de pago')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchMetodos()
    return () => { cancelled = true }
  }, [tenantSlug])

  if (loading) {
    return (
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-40 mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <Skeleton className="w-9 h-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="text-right space-y-1.5">
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-3 w-12 ml-auto" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-card border-2 border-destructive/20 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-4">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">No hay métodos de pago registrados este mes.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Métodos de pago</p>
        {data.map((m) => {
          const config = METHOD_CONFIG[m.method] ?? { label: m.method, color: 'text-muted-foreground', bg: 'bg-muted' }
          const initials = METHOD_INITIALS[m.method] ?? m.method.slice(0, 2).toUpperCase()
          return (
            <div key={m.method} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm', config.bg, config.color)}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{config.label}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold tabular-nums">{fmtPesos(m.revenue)}</p>
                <p className="text-xs text-muted-foreground">{m.orderCount} pedidos</p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
