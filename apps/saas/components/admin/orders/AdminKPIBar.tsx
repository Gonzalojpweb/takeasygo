'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { ShoppingBag, TrendingUp, Users, DollarSign, Eye, EyeOff, Package, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TiaMetrics {
  todayOrders: number
  todayRevenue: number
  todayNewMembers: number
  todayTakeawayOrders: number
  todayDeliveryOrders: number
}

interface SatisfactionData {
  excelente: number
  buena: number
  mejorable: number
  total: number
}

function getTimeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function AdminKPIBar({ userName }: { userName: string }) {
  const params = useParams()
  const tenantSlug = params.tenant as string

  const [metrics, setMetrics] = useState<TiaMetrics | null>(null)
  const [satisfaction, setSatisfaction] = useState<SatisfactionData | null>(null)
  const [revenueHidden, setRevenueHidden] = useState(true)

  useEffect(() => {
    if (!tenantSlug) return

    const fetchData = async () => {
      try {
        const [metricsRes, satRes] = await Promise.all([
          fetch(`/api/${tenantSlug}/tia/metrics`),
          fetch(`/api/${tenantSlug}/tia/satisfaction`),
        ])
        if (metricsRes.ok) {
          const data = await metricsRes.json()
          const summary = data.dailySummary ?? data
          setMetrics({
            todayOrders: summary.todayOrders ?? 0,
            todayRevenue: summary.todayRevenue ?? 0,
            todayNewMembers: summary.todayNewMembers ?? 0,
            todayTakeawayOrders: summary.todayTakeawayOrders ?? 0,
            todayDeliveryOrders: summary.todayDeliveryOrders ?? 0,
          })
        }
        if (satRes.ok) {
          setSatisfaction(await satRes.json())
        }
      } catch {}
    }

    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [tenantSlug])

  const satPercent = satisfaction && satisfaction.total > 0
    ? Math.round(((satisfaction.excelente + satisfaction.buena) / satisfaction.total) * 100)
    : null

  return (
    <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 md:px-5 md:py-3.5 border-b border-border/40 bg-background">
      {/* Greeting — left side */}
      <div className="min-w-0">
        <h1 className="text-sm font-extrabold tracking-tight text-foreground truncate">
          {getTimeGreeting()}, {userName}
        </h1>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5 hidden sm:block">
          Estado de tu operación en tiempo real
        </p>
      </div>

      {/* KPI Cards — right side, compact row */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Card 1: Total pedidos */}
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
            <ShoppingBag size={12} className="text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground tabular-nums leading-none">
              {metrics ? metrics.todayOrders : '—'}
            </p>
            <p className="text-[9px] font-semibold text-muted-foreground/60 leading-none mt-0.5">Pedidos</p>
          </div>
        </div>

        {/* Card 2: Satisfacción */}
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
            <TrendingUp size={12} className="text-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground tabular-nums leading-none">
              {satPercent !== null ? `${satPercent}%` : '—'}
            </p>
            <p className="text-[9px] font-semibold text-muted-foreground/60 leading-none mt-0.5">Satisfacción</p>
          </div>
        </div>

        {/* Card 3: Takeaway */}
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-md bg-sky-50 flex items-center justify-center shrink-0">
            <Package size={12} className="text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground tabular-nums leading-none">
              {metrics ? metrics.todayTakeawayOrders : '—'}
            </p>
            <p className="text-[9px] font-semibold text-muted-foreground/60 leading-none mt-0.5">Takeaway</p>
          </div>
        </div>

        {/* Card 4: Delivery */}
        <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-md bg-orange-50 flex items-center justify-center shrink-0">
            <Truck size={12} className="text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground tabular-nums leading-none">
              {metrics ? metrics.todayDeliveryOrders : '—'}
            </p>
            <p className="text-[9px] font-semibold text-muted-foreground/60 leading-none mt-0.5">Delivery</p>
          </div>
        </div>

        {/* Card 5: Club hoy */}
        <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
            <Users size={12} className="text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground tabular-nums leading-none">
              {metrics ? metrics.todayNewMembers : '—'}
            </p>
            <p className="text-[9px] font-semibold text-muted-foreground/60 leading-none mt-0.5">Club hoy</p>
          </div>
        </div>

        {/* Card 6: Ventas del día */}
        <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-md bg-purple-50 flex items-center justify-center shrink-0">
            <DollarSign size={12} className="text-purple-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className={cn(
                'text-sm font-black text-foreground tabular-nums leading-none',
                revenueHidden && 'blur-md select-none'
              )}>
                {metrics ? `$${metrics.todayRevenue.toLocaleString('es-AR')}` : '—'}
              </p>
              <button
                onClick={() => setRevenueHidden(v => !v)}
                className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
                title={revenueHidden ? 'Mostrar' : 'Ocultar'}
              >
                {revenueHidden ? <EyeOff size={9} /> : <Eye size={9} />}
              </button>
            </div>
            <p className="text-[9px] font-semibold text-muted-foreground/60 leading-none mt-0.5">Ventas del día</p>
          </div>
        </div>
      </div>
    </div>
  )
}
