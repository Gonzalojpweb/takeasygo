'use client'

import { useEffect, useState } from 'react'
import InfoTooltip from './InfoTooltip'
import type { ConversionFunnelData } from '@/lib/tia/metrics'

interface Props {
  data: ConversionFunnelData
}

export default function ConversionFunnel({ data }: Props) {
  const steps = [
    { key: 'menuOpened', label: 'Visitaron el menú', value: data.menuOpened },
    { key: 'dishViewed', label: 'Vieron un producto', value: data.dishViewed },
    { key: 'dishAdded', label: 'Agregaron al carrito', value: data.dishAdded },
    { key: 'checkoutStarted', label: 'Iniciaron checkout', value: data.checkoutStarted },
    { key: 'orderCompleted', label: 'Completaron pedido', value: data.orderCompleted },
  ]

  const maxValue = Math.max(...steps.map(s => s.value), 1)

  const conversionRate = data.menuOpened > 0
    ? ((data.orderCompleted / data.menuOpened) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Embutido de conversión</h2>
          <InfoTooltip text="Cómo los usuarios avanzan desde que abren el menú hasta que completan un pedido. Cada paso muestra cuántos usuarios llegaron a esa etapa." />
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Conversión total</p>
          <p className="text-lg font-bold text-zinc-900">{conversionRate}%</p>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => {
          const pct = (step.value / maxValue) * 100
          const drop = i > 0 && steps[i - 1].value > 0
            ? ((1 - step.value / steps[i - 1].value) * 100).toFixed(1)
            : null

          return (
            <div key={step.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-600">{step.label}</span>
                <span className="font-semibold text-zinc-900">{step.value.toLocaleString()}</span>
              </div>
              <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: i === steps.length - 1 ? '#22c55e' : '#3b82f6' }}
                />
              </div>
              {drop && (
                <p className="text-[10px] text-red-500 mt-0.5">-{drop}% vs paso anterior</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
