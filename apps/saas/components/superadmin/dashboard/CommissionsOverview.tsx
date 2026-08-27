'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, ArrowRightLeft, CreditCard, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'

interface CommissionData {
  transfer: {
    pending: number
    overdue: number
    settled: number
    statementCount: number
  }
  mercadopago: {
    autoSplit: number
    noSplit: number
    note: string
  }
  combined: {
    grandPending: number
    grandSettled: number
  }
  byTenant: Array<{
    tenantId: string
    name: string
    slug: string
    transferPending: number
    transferSettled: number
    mpAccumulated: number
    mpAutoSplit: boolean
    totalPending: number
  }>
}

function fmt(n: number) {
  return toPesos(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CommissionsOverview({ data: prefetchedData }: { data?: CommissionData }) {
  const [data, setData] = useState<CommissionData | null>(prefetchedData ?? null)
  const [loading, setLoading] = useState(!prefetchedData)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/dashboard/comisiones')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar comisiones')
      setData(json)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (prefetchedData) return
    fetchData()
  }, [prefetchedData, fetchData])

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-border/60 shadow-lg bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
          <span className="text-sm font-bold text-foreground uppercase tracking-widest">Comisiones</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border/60 shadow-lg bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={16} className="text-muted-foreground" />
          <span className="text-sm font-bold text-foreground uppercase tracking-widest">Comisiones</span>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-destructive">{error || 'Sin datos'}</p>
          <button onClick={fetchData} className="text-xs text-primary hover:underline mt-2">Reintentar</button>
        </div>
      </div>
    )
  }

  const { transfer, mercadopago, combined, byTenant } = data

  return (
    <div className="rounded-2xl border border-border/60 shadow-lg bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-4 md:p-6 pb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-foreground uppercase tracking-widest">Comisiones</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle'}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <div className="px-4 md:px-6 pb-4 md:pb-6">
        {/* 4 stat boxes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Transfer Pendiente */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Transfer (Pendiente)</span>
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                <ArrowRightLeft size={14} className="text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-black tracking-tight tabular-nums text-amber-800">${fmt(transfer.pending)}</p>
            {transfer.overdue > 0 && (
              <p className="text-[10px] text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertTriangle size={10} />
                ${fmt(transfer.overdue)} vencido(s)
              </p>
            )}
          </div>

          {/* MP Auto-split (Cobrado) */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">MP Auto-split</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={14} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-black tracking-tight tabular-nums text-emerald-800">${fmt(mercadopago.autoSplit)}</p>
            <p className="text-[10px] text-emerald-600 font-medium mt-1">Ya cobrado vía split</p>
          </div>

          {/* MP Sin Split (Pendiente) */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">MP Sin Split</span>
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                <CreditCard size={14} className="text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-black tracking-tight tabular-nums text-amber-800">${fmt(mercadopago.noSplit)}</p>
            <p className="text-[10px] text-amber-600 font-medium mt-1">Cobro manual pendiente</p>
          </div>

          {/* Total Pendiente */}
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Total Pendiente</span>
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <DollarSign size={14} className="text-red-600" />
              </div>
            </div>
            <p className="text-2xl font-black tracking-tight tabular-nums text-red-800">${fmt(combined.grandPending)}</p>
            <p className="text-[10px] text-red-600 font-medium mt-1">Por cobrar (transfer + MP sin split)</p>
          </div>
        </div>

        {/* Ya Saldado row */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 size={12} className="text-emerald-500" />
          <span>Total saldado: <span className="font-bold text-foreground">${fmt(combined.grandSettled)}</span></span>
        </div>

        {/* Expanded: per-tenant breakdown */}
        {expanded && byTenant.length > 0 && (
          <div className="mt-4 border-t border-border/40 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Detalle por Tenant</span>
              <span className="text-[10px] text-muted-foreground">({byTenant.length} comercios)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-3 py-2 text-left font-bold text-muted-foreground">Comercio</th>
                    <th className="px-3 py-2 text-right font-bold text-muted-foreground">Transfer</th>
                    <th className="px-3 py-2 text-right font-bold text-muted-foreground">MP</th>
                    <th className="px-3 py-2 text-right font-bold text-muted-foreground">Tipo MP</th>
                    <th className="px-3 py-2 text-right font-bold text-muted-foreground">Total Pend.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {byTenant.map((t) => (
                    <tr key={t.tenantId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <span className="font-semibold">{t.name}</span>
                        <span className="text-muted-foreground ml-1">/{t.slug}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700">${fmt(t.transferPending)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(t.mpAccumulated)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold',
                          t.mpAutoSplit ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        )}>
                          {t.mpAutoSplit ? 'Auto-split' : 'Sin split'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">${fmt(t.totalPending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MP note */}
        <div className="mt-3 flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <Info size={11} className="shrink-0 mt-0.5" />
          <span>{mercadopago.note}</span>
        </div>
      </div>
    </div>
  )
}
