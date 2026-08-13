'use client'

import { Input } from '@/components/ui/input'
import { Calendar } from 'lucide-react'

export default function ReportsDateRange() {
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''

  function update(key: 'from' | 'to', value: string) {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
    window.location.href = url.toString()
  }

  return (
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
  )
}
