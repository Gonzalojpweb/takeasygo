'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'

interface MarginRecoveryData {
  totalSurcharge: number
  totalPlatformFee: number
  netRecovered: number
  orderCount: number
  avgSurchargePercent: number
}

function fmtPesos(cents: number) {
  return `$${toPesos(cents).toLocaleString('es-AR')}`
}

export default function MarginRecoveryCard({ tenantSlug, data: prefetchedData }: { tenantSlug: string; data?: MarginRecoveryData }) {
  const [data, setData] = useState<MarginRecoveryData | null>(prefetchedData ?? null)
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
          setData(json.marginRecovery)
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [tenantSlug, prefetchedData])

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-lg overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-8 w-36 bg-muted rounded animate-pulse mb-2" />
          <div className="h-3 w-64 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  if (!data || data.orderCount === 0) return null

  return (
    <Card className="rounded-2xl border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-lg overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-900">Recuperación de Margen</p>
            <p className="text-[11px] text-emerald-700/70">
              TakeasyGO protege tu rentabilidad en cada venta
            </p>
          </div>
        </div>

        {/* Main number */}
        <div className="mb-4">
          <p className="text-3xl font-black tracking-tight text-emerald-800 tabular-nums">
            {fmtPesos(data.netRecovered)}
          </p>
          <p className="text-xs text-emerald-700/70 mt-1">
            recuperados en margen este mes
          </p>
        </div>

        {/* Explanation — plain language */}
        <div className="bg-white/60 rounded-xl p-4 mb-4 border border-emerald-100">
          <p className="text-sm text-emerald-900 leading-relaxed">
            Sin TakeasyGO, estas comisiones las pagarías de tu bolsillo. Con nuestra integración de cobro,
            el cliente las cubre directamente al momento de pagar. <span className="font-bold">Cada venta con recargo
            es margen que conservás.</span>
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-800 tabular-nums">{data.orderCount}</p>
            <p className="text-[10px] text-emerald-700/60 font-medium">ventas con recargo</p>
          </div>
          <div className="text-center border-x border-emerald-200/50">
            <p className="text-lg font-bold text-emerald-800 tabular-nums">{data.avgSurchargePercent}%</p>
            <p className="text-[10px] text-emerald-700/60 font-medium">recargo promedio</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-800 tabular-nums">{fmtPesos(data.totalSurcharge)}</p>
            <p className="text-[10px] text-emerald-700/60 font-medium">total recargado</p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-700/50">
          <TrendingUp size={12} />
          <span>Tus clientes cubren las comisiones, vos mantenés tu ganancia</span>
        </div>
      </CardContent>
    </Card>
  )
}
