'use client'

import { Users, ArrowRight, Clock } from 'lucide-react'

interface Props {
  data: {
    totalFirstTimeBuyers: number
    convertedWithinWindow: number
    conversionRate: number
    avgDaysToSecond: number
    windowDays: number
  }
}

export default function RetentionFunnel({ data }: Props) {
  const { totalFirstTimeBuyers, convertedWithinWindow, conversionRate, avgDaysToSecond, windowDays } = data

  if (totalFirstTimeBuyers === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <h3 className="text-sm font-semibold text-zinc-700 mb-4">Retención: Primera → Segunda Compra</h3>
        <p className="text-sm text-zinc-400 text-center py-6">No hay compradores de primera vez recientes</p>
      </div>
    )
  }

  const droppedOff = totalFirstTimeBuyers - convertedWithinWindow
  const droppedPct = totalFirstTimeBuyers > 0 ? (droppedOff / totalFirstTimeBuyers) * 100 : 0
  const convertedPct = conversionRate * 100

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-zinc-700">Retención: Primera → Segunda Compra</h3>
      </div>

      {/* Funnel visualization */}
      <div className="space-y-3">
        {/* Step 1: First-time buyers */}
        <div className="flex items-center gap-3">
          <div className="w-32 text-right">
            <p className="text-lg font-bold text-zinc-900">{totalFirstTimeBuyers}</p>
            <p className="text-[10px] text-zinc-500">Primera compra</p>
          </div>
          <div className="flex-1 h-8 bg-blue-100 rounded-lg overflow-hidden">
            <div className="h-full bg-blue-500 rounded-lg" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center gap-3">
          <div className="w-32 text-right">
            <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-400">
              <Clock size={10} />
              ≤{windowDays} días
            </div>
          </div>
          <ArrowRight size={14} className="text-zinc-300" />
        </div>

        {/* Step 2: Converted */}
        <div className="flex items-center gap-3">
          <div className="w-32 text-right">
            <p className="text-lg font-bold text-green-600">{convertedWithinWindow}</p>
            <p className="text-[10px] text-zinc-500">Segunda compra</p>
          </div>
          <div className="flex-1 h-8 bg-green-100 rounded-lg overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-lg transition-all"
              style={{ width: `${convertedPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-green-600 w-12 text-right">
            {convertedPct.toFixed(0)}%
          </span>
        </div>

        {/* Dropped off */}
        <div className="flex items-center gap-3">
          <div className="w-32 text-right">
            <p className="text-lg font-bold text-red-500">{droppedOff}</p>
            <p className="text-[10px] text-zinc-500">No volvieron</p>
          </div>
          <div className="flex-1 h-8 bg-red-50 rounded-lg overflow-hidden">
            <div
              className="h-full bg-red-300 rounded-lg transition-all"
              style={{ width: `${droppedPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-red-500 w-12 text-right">
            {droppedPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Stats footer */}
      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Tiempo promedio a segunda compra:
        </span>
        <span className="text-sm font-semibold text-zinc-900">
          {avgDaysToSecond} días
        </span>
      </div>
    </div>
  )
}
