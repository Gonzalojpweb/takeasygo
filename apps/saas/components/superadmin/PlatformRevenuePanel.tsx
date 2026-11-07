'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Download, ArrowUpDown, Zap, Hand } from 'lucide-react'
import { toast } from 'sonner'

// Ingresos de la plataforma por comercio (superadmin). Datos: /api/superadmin/ingresos.

type Method = 'transfer' | 'mercadopago' | 'cash' | 'kripton' | 'other'
type ByMethod = Record<Method, number>
interface Bucket { key: string; total: number; byMethod: ByMethod; gmv: number; orders: number }
interface TenantRow {
  tenantId: string; name: string; slug: string; plan: string; planLabel: string; subscriptionStatus: string | null
  monthlyFee: number | null; mpAutoSplit: boolean; commission: number; byMethod: ByMethod; gmv: number; orders: number
  share: number; effectiveRate: number; manualDebt: number
}
interface Data {
  range: { from: string; to: string }
  group: 'week' | 'month'
  totals: { commission: number; byMethod: ByMethod; gmv: number; orders: number; effectiveRate: number; mpAutoSplit: number; mpManual: number; manualDebt: number; monthlyFees: number }
  series: Bucket[]
  tenants: TenantRow[]
}

const METHODS: { id: Method; label: string; color: string }[] = [
  { id: 'transfer', label: 'Transferencia', color: 'bg-sky-500' },
  { id: 'mercadopago', label: 'Mercado Pago', color: 'bg-indigo-500' },
  { id: 'cash', label: 'Efectivo', color: 'bg-emerald-500' },
  { id: 'kripton', label: 'Kripton', color: 'bg-amber-500' },
  { id: 'other', label: 'Otros', color: 'bg-slate-400' },
]

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('es-AR')}`
const SUB_LABEL: Record<string, string> = { authorized: 'Al día', pending: 'Pendiente', paused: 'Pausada', cancelled: 'Cancelada' }

function todayAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function shift(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function mondayOf(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  return shift(day, -(dow === 0 ? 6 : dow - 1))
}

type Preset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_3m' | 'this_year' | 'custom'
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'this_week', label: 'Esta semana' },
  { id: 'last_week', label: 'Semana pasada' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes pasado' },
  { id: 'last_3m', label: 'Últimos 3 meses' },
  { id: 'this_year', label: 'Este año' },
  { id: 'custom', label: 'Elegir fechas' },
]

function presetRange(p: Preset): { from: string; to: string } | null {
  const t = todayAR()
  switch (p) {
    case 'this_week': return { from: mondayOf(t), to: t }
    case 'last_week': { const m = shift(mondayOf(t), -7); return { from: m, to: shift(m, 6) } }
    case 'this_month': return { from: `${t.slice(0, 7)}-01`, to: t }
    case 'last_month': { const first = `${t.slice(0, 7)}-01`; const end = shift(first, -1); return { from: `${end.slice(0, 7)}-01`, to: end } }
    case 'last_3m': { const first = `${t.slice(0, 7)}-01`; const d = new Date(`${first}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 2); return { from: d.toISOString().slice(0, 10), to: t } }
    case 'this_year': return { from: `${t.slice(0, 4)}-01-01`, to: t }
    default: return null
  }
}

// La semana o el mes se recortan al período elegido: muestra los días que de verdad cubre.
function bucketLabel(key: string, group: 'week' | 'month', range: { from: string; to: string }): string {
  if (group === 'month') {
    return new Date(`${key}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const from = key < range.from ? range.from : key
  const end = shift(key, 6)
  const to = end > range.to ? range.to : end
  return from === to ? f(from) : `${f(from)} – ${f(to)}`
}

type SortKey = 'commission' | 'gmv' | 'orders' | 'effectiveRate' | 'manualDebt' | 'name'

export default function PlatformRevenuePanel() {
  const [preset, setPreset] = useState<Preset>('this_month')
  const [custom, setCustom] = useState(() => presetRange('this_month')!)
  const [group, setGroup] = useState<'week' | 'month'>('week')
  const [tenant, setTenant] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'commission', dir: -1 })
  const [tenantOptions, setTenantOptions] = useState<{ id: string; name: string }[]>([])

  const range = preset === 'custom' ? custom : presetRange(preset)!

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to, group, ...(tenant ? { tenant } : {}) })
      const res = await fetch(`/api/superadmin/ingresos?${qs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudieron cargar los ingresos')
      setData(body)
      if (!tenant) setTenantOptions((body as Data).tenants.map(t => ({ id: t.tenantId, name: t.name })).sort((a, b) => a.name.localeCompare(b.name, 'es')))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, group, tenant])

  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const list = [...data.tenants]
    list.sort((a, b) => (sort.key === 'name' ? a.name.localeCompare(b.name, 'es') : (a[sort.key] as number) - (b[sort.key] as number)) * sort.dir)
    return list
  }, [data, sort])

  const maxBucket = data ? Math.max(1, ...data.series.map(b => b.total)) : 1

  function toggleSort(key: SortKey) {
    setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }))
  }

  function downloadCsv() {
    if (!data) return
    const head = ['Comercio', 'Plan', 'Suscripción', 'Abono mensual', 'Comisión total', ...METHODS.map(m => `Comisión ${m.label}`), 'Facturación procesada', 'Pedidos', '% de los ingresos', 'Tasa efectiva %', 'Deuda manual a hoy', 'MP automático']
    const lines = data.tenants.map(t => [
      t.name, t.planLabel, SUB_LABEL[t.subscriptionStatus ?? ''] ?? '', t.monthlyFee != null ? t.monthlyFee / 100 : '',
      t.commission / 100, ...METHODS.map(m => t.byMethod[m.id] / 100), t.gmv / 100, t.orders, t.share, t.effectiveRate, t.manualDebt / 100, t.mpAutoSplit ? 'sí' : 'no',
    ])
    const csv = [head, ...lines].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ingresos-${data.range.from}-al-${data.range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th className={`px-3 py-2 text-${align}`}>
      <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label} <ArrowUpDown size={11} className={sort.key === key ? 'text-primary' : 'opacity-40'} />
      </button>
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-full px-3 py-1 text-sm border ${preset === p.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {preset === 'custom' && (
            <>
              <label className="text-xs text-muted-foreground flex flex-col gap-1">Desde
                <input id="rev-from" type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground flex flex-col gap-1">Hasta
                <input id="rev-to" type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
              </label>
            </>
          )}
          <label className="text-xs text-muted-foreground flex flex-col gap-1">Agrupar por
            <select id="rev-group" value={group} onChange={e => setGroup(e.target.value as 'week' | 'month')} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="week">Semana (lunes a domingo)</option>
              <option value="month">Mes</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1 min-w-[200px]">Comercio
            <select id="rev-tenant" value={tenant} onChange={e => setTenant(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="">Todos</option>
              {tenantOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button onClick={downloadCsv} disabled={!data} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <Download size={14} /> Descargar CSV
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : data && (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
          {/* Resumen */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ingresos por comisiones</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{money(data.totals.commission)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.totals.orders.toLocaleString('es-AR')} pedidos · tasa {data.totals.effectiveRate}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Facturación procesada</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{money(data.totals.gmv)}</p>
              <p className="text-xs text-muted-foreground mt-1">Pedidos con pago aprobado en la app</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Mercado Pago</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{money(data.totals.byMethod.mercadopago)}</p>
              <p className="text-xs text-muted-foreground mt-1">{money(data.totals.mpAutoSplit)} automático · {money(data.totals.mpManual)} a cobrar</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Transferencia y efectivo</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{money(data.totals.byMethod.transfer + data.totals.byMethod.cash)}</p>
              <p className="text-xs text-muted-foreground mt-1">Deuda a hoy: <span className="text-destructive font-medium">{money(data.totals.manualDebt)}</span></p>
            </div>
          </section>

          {/* Serie por semana o mes */}
          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Comisiones por {data.group === 'week' ? 'semana' : 'mes'}</h2>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {METHODS.filter(m => data.totals.byMethod[m.id] > 0).map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${m.color}`} />{m.label}</span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-3 py-2 text-left">{data.group === 'week' ? 'Semana' : 'Mes'}</th>
                    <th className="px-3 py-2 text-left w-1/3"></th>
                    <th className="px-3 py-2 text-right">Transferencia</th>
                    <th className="px-3 py-2 text-right">Mercado Pago</th>
                    <th className="px-3 py-2 text-right">Efectivo y otros</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map(b => (
                    <tr key={b.key} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap capitalize">{bucketLabel(b.key, data.group, data.range)}</td>
                      <td className="px-3 py-2">
                        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted" style={{ width: `${Math.max(2, (b.total / maxBucket) * 100)}%` }}>
                          {METHODS.map(m => b.byMethod[m.id] > 0 && (
                            <div key={m.id} className={m.color} style={{ width: `${(b.byMethod[m.id] / (b.total || 1)) * 100}%` }} title={`${m.label}: ${money(b.byMethod[m.id])}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(b.byMethod.transfer)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(b.byMethod.mercadopago)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(b.byMethod.cash + b.byMethod.kripton + b.byMethod.other)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(b.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{b.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Aporte por comercio */}
          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div>
              <h2 className="font-semibold">Cuánto aporta cada comercio</h2>
              <p className="text-xs text-muted-foreground">
                Comisiones del período. «Abono» es el precio mensual de su plan, como referencia: no se suma a las comisiones porque no hay historial de cobros de suscripciones.
                «Deuda» es lo que debe hoy de comisiones por transferencia y efectivo.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    {th('name', 'Comercio', 'left')}
                    {th('commission', 'Comisión')}
                    <th className="px-3 py-2 text-right">% del total</th>
                    <th className="px-3 py-2 text-right">Transf.</th>
                    <th className="px-3 py-2 text-right">MP</th>
                    {th('gmv', 'Facturación')}
                    {th('orders', 'Pedidos')}
                    {th('effectiveRate', 'Tasa')}
                    {th('manualDebt', 'Deuda')}
                    <th className="px-3 py-2 text-right">Abono</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.tenantId} className={`border-t border-border ${t.commission === 0 ? 'text-muted-foreground' : ''}`}>
                      <td className="px-3 py-2">
                        <Link href={`/superadmin/tenants/${t.tenantId}`} className="font-medium hover:underline">{t.name}</Link>
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={t.mpAutoSplit ? 'Mercado Pago cobra la comisión solo' : 'Comisión de Mercado Pago a cobrar a mano'}>
                          {t.mpAutoSplit ? <Zap size={11} className="text-emerald-600" /> : <Hand size={11} />}
                          {t.planLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(t.commission)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="inline-flex items-center gap-2 justify-end">
                          <span className="hidden md:inline-block h-1.5 w-12 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${Math.min(100, t.share)}%` }} /></span>
                          {t.share}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(t.byMethod.transfer)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(t.byMethod.mercadopago)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(t.gmv)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.orders}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.effectiveRate}%</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${t.manualDebt > 0 ? 'text-destructive font-medium' : ''}`}>{money(t.manualDebt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {t.monthlyFee != null ? money(t.monthlyFee) : '—'}
                        {t.subscriptionStatus && <span className="block text-[11px] text-muted-foreground">{SUB_LABEL[t.subscriptionStatus] ?? t.subscriptionStatus}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
