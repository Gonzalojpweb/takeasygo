'use client'

import { useEffect, useState } from 'react'
import { Truck, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'

interface DeliveryDay {
  date: string
  orderCount: number
  deliveryCollected: number
  platformFees: number
  netForDelivery: number
}

interface Props {
  tenantSlug: string
  data?: DeliveryDay[]
}

function fmtPesos(cents: number) {
  return `$${toPesos(cents).toLocaleString('es-AR')}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.toLocaleDateString('es-AR', { weekday: 'short' })
  const date = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })
  return { day, date }
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom',
}

export default function DeliveryConciliation({ tenantSlug, data: prefetchedData }: Props) {
  const [data, setData] = useState<DeliveryDay[]>(prefetchedData ?? [])
  const [loading, setLoading] = useState(!prefetchedData)

  useEffect(() => {
    if (prefetchedData) {
      setData(prefetchedData)
      setLoading(false)
      return
    }

    let cancelled = false
    fetch(`/api/${tenantSlug}/admin/dashboard/summary`)
      .then(res => res.json())
      .then(json => {
        if (!cancelled) {
          setData(json.deliveryConciliation || [])
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [tenantSlug, prefetchedData])

  // Totals for the month
  const totals = data.reduce(
    (acc, d) => ({
      orderCount: acc.orderCount + d.orderCount,
      deliveryCollected: acc.deliveryCollected + d.deliveryCollected,
      platformFees: acc.platformFees + d.platformFees,
      netForDelivery: acc.netForDelivery + d.netForDelivery,
    }),
    { orderCount: 0, deliveryCollected: 0, platformFees: 0, netForDelivery: 0 }
  )

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Truck size={16} className="text-muted-foreground animate-pulse" />
            Conciliación de Delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) return null

  return (
    <Card className="rounded-2xl border-border/60 shadow-lg overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Truck size={16} className="text-blue-500" />
          Conciliación de Delivery
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Lo que cobró la app en envíos y lo disponible para pagar al personal
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Summary row */}
        <div className="flex items-center gap-4 p-3 rounded-xl bg-blue-50 border border-blue-100 mb-4">
          <div className="flex-1">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Cobrado en envíos</p>
            <p className="text-lg font-black text-blue-800 tabular-nums">{fmtPesos(totals.deliveryCollected)}</p>
          </div>
          <div className="w-px h-8 bg-blue-200" />
          <div className="flex-1">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Comisión plataforma</p>
            <p className="text-lg font-black text-blue-800 tabular-nums">{fmtPesos(totals.platformFees)}</p>
          </div>
          <div className="w-px h-8 bg-blue-200" />
          <div className="flex-1">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Disponible p/ delivery</p>
            <p className="text-lg font-black text-emerald-800 tabular-nums">{fmtPesos(totals.netForDelivery)}</p>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-muted/30 rounded-lg px-3 py-2 mb-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            El costo de envío que cobramos al cliente se usa para pagar al personal de delivery.
            La plataforma retiene una comisión por cada delivery procesado. El saldo restante es lo que vos
            usás para liquidar a tu equipo.
          </p>
        </div>

        {/* Daily breakdown — last 14 days */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/30">
                <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Día</th>
                <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">Pedidos</th>
                <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">Cobrado</th>
                <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">Comisión</th>
                <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">Para delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {data.slice(0, 14).map((d) => {
                const { day, date } = formatDate(d.date)
                const shortDay = DAY_LABELS[day.toLowerCase()] || day
                return (
                  <tr key={d.date} className="hover:bg-muted/30 transition-colors">
                    <td className="px-2 py-2">
                      <span className="font-semibold text-foreground">{shortDay}</span>
                      <span className="text-muted-foreground ml-1">{date}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{d.orderCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtPesos(d.deliveryCollected)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-600">{fmtPesos(d.platformFees)}</td>
                    <td className={cn(
                      'px-2 py-2 text-right tabular-nums font-bold',
                      d.netForDelivery >= 0 ? 'text-emerald-600' : 'text-destructive'
                    )}>
                      {fmtPesos(d.netForDelivery)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
