'use client'

import { Input } from '@/components/ui/input'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESETS = [
  { label: '7 días', from: () => daysAgo(7), to: () => today() },
  { label: '30 días', from: () => daysAgo(30), to: () => today() },
  { label: 'Este mes', from: () => startOfMonth(), to: () => today() },
  { label: 'Mes anterior', from: () => startOfLastMonth(), to: () => endOfLastMonth() },
  { label: '3 meses', from: () => daysAgo(90), to: () => today() },
  { label: '6 meses', from: () => daysAgo(180), to: () => today() },
  { label: '1 año', from: () => daysAgo(365), to: () => today() },
]

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function startOfLastMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function endOfLastMonth() {
  const d = new Date()
  d.setDate(0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isCurrentPreset(from: string, to: string, preset: typeof PRESETS[number]) {
  return from === preset.from() && to === preset.to()
}

export default function ReportsDateRange() {
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const isCustom = from && to

  function update(key: 'from' | 'to', value: string) {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
    window.location.href = url.toString()
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    const url = new URL(window.location.href)
    url.searchParams.set('from', preset.from())
    url.searchParams.set('to', preset.to())
    window.location.href = url.toString()
  }

  function clearRange() {
    const url = new URL(window.location.href)
    url.searchParams.delete('from')
    url.searchParams.delete('to')
    window.location.href = url.toString()
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(preset => {
          const active = isCustom && isCurrentPreset(from, to, preset)
          return (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
              )}
            >
              {preset.label}
            </button>
          )
        })}
        {isCustom && (
          <button
            onClick={clearRange}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-muted-foreground" />
        <Input
          type="date"
          value={from}
          onChange={e => update('from', e.target.value)}
          className="w-36 h-9 text-sm"
          aria-label="Desde"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          value={to}
          onChange={e => update('to', e.target.value)}
          className="w-36 h-9 text-sm"
          aria-label="Hasta"
        />
      </div>
    </div>
  )
}
