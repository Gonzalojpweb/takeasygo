'use client'

import { Eye, XCircle, CheckCircle } from 'lucide-react'

interface Props {
  data: {
    totalInsights: number
    readCount: number
    dismissedCount: number
    resolvedCount: number
    readRate: number
    dismissRate: number
    resolveRate: number
  } | null
}

export default function TiaPerformancePanel({ data }: Props) {
  if (!data || data.totalInsights === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-zinc-700">TIA Performance</h3>
        </div>
        <p className="text-sm text-zinc-400 text-center py-6">
          Sin insights generados hoy
        </p>
      </div>
    )
  }

  const readPct = data.readRate * 100
  const dismissPct = data.dismissRate * 100
  const resolvePct = data.resolveRate * 100

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Eye size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-zinc-700">TIA Performance</h3>
        <span className="text-[10px] text-zinc-400 ml-auto">Hoy</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Read rate */}
        <div className="text-center">
          <div className="relative inline-flex items-center justify-center w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#6366f1"
                strokeWidth="3"
                strokeDasharray={`${readPct}, 100`}
              />
            </svg>
            <span className="absolute text-xs font-bold text-zinc-900">{readPct.toFixed(0)}%</span>
          </div>
          <p className="text-xs text-zinc-500 mt-2">Leídos</p>
          <p className="text-[10px] text-zinc-400">{data.readCount} / {data.totalInsights}</p>
        </div>

        {/* Dismiss rate */}
        <div className="text-center">
          <div className="relative inline-flex items-center justify-center w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3"
                strokeDasharray={`${dismissPct}, 100`}
              />
            </svg>
            <span className="absolute text-xs font-bold text-zinc-900">{dismissPct.toFixed(0)}%</span>
          </div>
          <p className="text-xs text-zinc-500 mt-2">Descartados</p>
          <p className="text-[10px] text-zinc-400">{data.dismissedCount} / {data.totalInsights}</p>
        </div>

        {/* Resolve rate */}
        <div className="text-center">
          <div className="relative inline-flex items-center justify-center w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#22c55e"
                strokeWidth="3"
                strokeDasharray={`${resolvePct}, 100`}
              />
            </svg>
            <span className="absolute text-xs font-bold text-zinc-900">{resolvePct.toFixed(0)}%</span>
          </div>
          <p className="text-xs text-zinc-500 mt-2">Resueltos</p>
          <p className="text-[10px] text-zinc-400">{data.resolvedCount} / {data.totalInsights}</p>
        </div>
      </div>
    </div>
  )
}
