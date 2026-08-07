'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Users, TrendingUp, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CustomerSegmentBadge } from '../cis'
import { toPesos } from '@takeasygo/business'

// ─────────────────────────────────────────────────────────────────────────────
// LTVDashboard — Dashboard consolidado de Lifetime Value
// ─────────────────────────────────────────────────────────────────────────────
// Muestra LTV por segmento, top clientes, histograma de distribución.
// Lenguaje humano: todos los labels en español para dueños de restaurantes.
// ─────────────────────────────────────────────────────────────────────────────

interface LTVBySegment {
  segment: string
  avgLTV: number
  avgTicket: number
  avgVisitFrequency: number
  count: number
}

interface TopCustomer {
  name: string
  phone: string
  segment: string
  totalSpent: number
  avgTicket: number
  orderCount: number
  healthScore: number
  visitFrequency: number
}

interface HistogramBin {
  label: string
  count: number
}

interface Aggregated {
  totalLTV: number
  avgLTV: number
  medianLTV: number
  maxLTV: number
  minLTV: number
  totalCustomers: number
}

interface LTVData {
  ltvBySegment: LTVBySegment[]
  topCustomers: TopCustomer[]
  histogram: HistogramBin[]
  aggregated: Aggregated
}

interface Props {
  tenantSlug: string
}

const SEGMENT_COLORS: Record<string, string> = {
  VIP: '#8b5cf6',
  PREMIUM: '#f59e0b',
  FREQUENT: '#10b981',
  LOYAL: '#059669',
  HIGH_POTENTIAL: '#6366f1',
  EXPLORER: '#06b6d4',
  NEW: '#3b82f6',
  AT_RISK: '#ef4444',
  DORMANT: '#71717a',
  PROMOTION_HUNTER: '#f97316',
}

const SEGMENT_LABELS: Record<string, string> = {
  VIP: 'VIP',
  PREMIUM: 'Premium',
  FREQUENT: 'Frecuente',
  LOYAL: 'Leal',
  HIGH_POTENTIAL: 'Alto Potencial',
  EXPLORER: 'Explorador',
  NEW: 'Nuevo',
  AT_RISK: 'En Riesgo',
  DORMANT: 'Dormido',
  PROMOTION_HUNTER: 'Promo Hunter',
}

function fmtCurrency(n: number) {
  return `$${toPesos(n).toLocaleString('es-AR')}`
}

export default function LTVDashboard({ tenantSlug }: Props) {
  const [data, setData] = useState<LTVData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(`/api/${tenantSlug}/crm/ltv`)
        if (!res.ok) throw new Error()
        const json = await res.json()
        setData(json)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [tenantSlug])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        No se pudieron cargar los datos de LTV.
      </div>
    )
  }

  const { ltvBySegment, topCustomers, histogram, aggregated } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black tracking-tight">Inteligencia de Clientes</h2>
        <p className="text-sm text-muted-foreground mt-1">Lifetime Value y distribución de valor por cliente</p>
      </div>

      {/* Aggregated Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-border p-4 bg-card">
          <DollarSign size={16} className="text-primary mb-1.5" />
          <p className="text-xl font-black">{fmtCurrency(aggregated.avgLTV)}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Gasto Promedio</p>
        </div>
        <div className="rounded-2xl border border-border p-4 bg-card">
          <DollarSign size={16} className="text-emerald-500 mb-1.5" />
          <p className="text-xl font-black">{fmtCurrency(aggregated.medianLTV)}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Gasto Mediano</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">El 50% gasta menos que esto</p>
        </div>
        <div className="rounded-2xl border border-border p-4 bg-card">
          <TrendingUp size={16} className="text-amber-500 mb-1.5" />
          <p className="text-xl font-black">{fmtCurrency(aggregated.maxLTV)}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Gasto Máximo</p>
        </div>
        <div className="rounded-2xl border border-border p-4 bg-card">
          <Users size={16} className="text-primary mb-1.5" />
          <p className="text-xl font-black">{aggregated.totalCustomers}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Clientes con Gasto</p>
        </div>
        <div className="rounded-2xl border border-border p-4 bg-card">
          <DollarSign size={16} className="text-purple-500 mb-1.5" />
          <p className="text-xl font-black">{fmtCurrency(aggregated.totalLTV)}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Ingreso Total</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LTV by Segment Bar Chart */}
        <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
          <h3 className="text-sm font-bold text-foreground">Gasto Promedio por Segmento</h3>
          <p className="text-xs text-muted-foreground">Cuánto gasta en promedio cada tipo de cliente</p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ltvBySegment} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="segment"
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => SEGMENT_LABELS[v] ?? v}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) => [fmtCurrency(Number(value)), 'Gasto promedio']}
                  labelFormatter={(label) => SEGMENT_LABELS[label as string] ?? label}
                />
                <Bar dataKey="avgLTV" radius={[4, 4, 0, 0]} barSize={36}>
                  {ltvBySegment.map((entry, idx) => (
                    <Cell key={idx} fill={SEGMENT_COLORS[entry.segment] ?? '#71717a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Descripción textual */}
          <div className="space-y-1 text-xs text-muted-foreground">
            {ltvBySegment.map((d, i) => (
              <p key={i}>
                Los <span className="font-semibold text-foreground">{SEGMENT_LABELS[d.segment] ?? d.segment}</span>{' '}
                gastan en promedio <span className="font-semibold text-foreground">{fmtCurrency(d.avgLTV)}</span> por cliente.
              </p>
            ))}
          </div>
        </div>

        {/* Histogram */}
        <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
          <h3 className="text-sm font-bold text-foreground">Distribución de Gasto</h3>
          <p className="text-xs text-muted-foreground">Cuántos clientes hay en cada rango de gasto</p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 8, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value) => [`${value} cliente${Number(value) !== 1 ? 's' : ''}`, 'Cantidad']}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Descripción */}
          <p className="text-xs text-muted-foreground">
            La mayoría de tus clientes están en el rango de <span className="font-semibold text-foreground">
            {histogram.reduce((max, h) => h.count > max.count ? h : max, histogram[0])?.label ?? '—'}</span>.
          </p>
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-muted/30 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Top Clientes por Gasto</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Los clientes que más valor aportan a tu restaurante</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">Segmento</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">Gasto Total</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">Ticket Prom.</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">Pedidos</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground">Salud</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground font-medium">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.name || '—'}</p>
                    {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <CustomerSegmentBadge segment={c.segment as any} compact />
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{fmtCurrency(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(c.avgTicket)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.orderCount}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-bold ${c.healthScore >= 75 ? 'text-emerald-600' : c.healthScore >= 50 ? 'text-amber-600' : c.healthScore >= 25 ? 'text-orange-600' : 'text-red-600'}`}>
                      {c.healthScore}
                    </span>
                  </td>
                </tr>
              ))}
              {topCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    No hay datos de clientes todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
