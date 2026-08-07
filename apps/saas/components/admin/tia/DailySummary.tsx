'use client'

import { ShoppingBag, DollarSign, Users, Gift, Clock, TrendingUp } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { DailySummaryData } from '@/lib/tia/metrics'
import { toPesos } from '@takeasygo/business'

interface Props {
  data: DailySummaryData
}

export default function DailySummary({ data }: Props) {
  const cards = [
    {
      label: 'Pedidos hoy',
      value: data.todayOrders,
      icon: ShoppingBag,
      color: 'text-blue-600 bg-blue-100',
      tooltip: 'Pedidos confirmados y completados hoy. No incluye cancelados ni pendientes de pago.',
    },
    {
      label: 'Ingresos hoy',
      value: `$${toPesos(data.todayRevenue).toLocaleString('es-AR')}`,
      icon: DollarSign,
      color: 'text-green-600 bg-green-100',
      tooltip: 'Suma total de todos los pedidos completados hoy, incluyendo impuestos y costos de envío.',
    },
    {
      label: 'Ticket promedio',
      value: `$${toPesos(data.avgOrderValue).toLocaleString('es-AR')}`,
      icon: TrendingUp,
      color: 'text-violet-600 bg-violet-100',
      tooltip: 'Valor promedio por pedido. Se calcula como ingresos totales / cantidad de pedidos del día.',
    },
    {
      label: 'Nuevos miembros Club',
      value: data.todayNewMembers,
      icon: Users,
      color: 'text-amber-600 bg-amber-100',
      tooltip: 'Personas que se unieron al club de fidelización hoy. Un club activo aumenta la recurrencia.',
    },
    {
      label: 'Rewards canjeados',
      value: data.todayRewardsRedeemed,
      icon: Gift,
      color: 'text-pink-600 bg-pink-100',
      tooltip: 'Productos canjeados con puntos del Club. Cuantos más canjes, mayor engagement.',
    },
    {
      label: 'Pedidos pendientes',
      value: data.pendingOrders,
      icon: Clock,
      color: 'text-orange-600 bg-orange-100',
      tooltip: 'Pedidos en curso (confirmados o en preparación). Un número alto puede indicar demoras.',
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Resumen del día</h2>
        <InfoTooltip text="Métricas del día de hoy en tiempo real. Los datos se actualizan automáticamente." />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className="rounded-xl border border-zinc-100 p-3 space-y-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
              <card.icon size={16} />
            </div>
            <p className="text-xs text-zinc-500">{card.label}</p>
            <p className="text-lg font-bold text-zinc-900">{card.value}</p>
            <div className="flex items-center gap-1">
              <InfoTooltip text={card.tooltip} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
