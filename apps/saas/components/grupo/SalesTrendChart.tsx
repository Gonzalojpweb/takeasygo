'use client'

import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BRAND_COLORS, fmtDate, money, moneyShort } from './format'

interface Props {
  unit: 'day' | 'hour'
  labels: string[]
  prevTotal: number[]
  byBrand: { slug: string; name: string; values: number[] }[]
  compareLabel: string
}

/** Facturación por día (u hora): una capa por marca, apiladas, y el período anterior punteado. */
export default function SalesTrendChart({ unit, labels, prevTotal, byBrand, compareLabel }: Props) {
  const data = labels.map((l, i) => {
    const row: Record<string, number | string> = { label: unit === 'hour' ? `${l}:00` : fmtDate(l), prev: prevTotal[i] ?? 0 }
    for (const b of byBrand) row[b.slug] = b.values[i] ?? 0
    return row
  })
  const empty = data.every(d => byBrand.every(b => !d[b.slug]) && !d.prev)

  if (empty) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin ventas en el período.</div>
  }

  return (
    <div className="w-full">
      <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} className="fill-muted-foreground" />
          <YAxis tickFormatter={v => moneyShort(Number(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const rows = payload.filter(p => p.dataKey !== 'prev')
              const total = rows.reduce((s, p) => s + Number(p.value ?? 0), 0)
              const prev = Number(payload.find(p => p.dataKey === 'prev')?.value ?? 0)
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-semibold text-foreground">{label}</p>
                  {rows.map(p => (
                    <p key={String(p.dataKey)} className="flex justify-between gap-4"><span style={{ color: p.color }}>{p.name}</span><span className="tabular-nums">{money(Number(p.value ?? 0))}</span></p>
                  ))}
                  {rows.length > 1 && <p className="mt-1 flex justify-between gap-4 border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{money(total)}</span></p>}
                  <p className="mt-1 flex justify-between gap-4 text-muted-foreground"><span>Período anterior</span><span className="tabular-nums">{money(prev)}</span></p>
                </div>
              )
            }}
          />
          {byBrand.map((b, i) => (
            <Area key={b.slug} type="monotone" dataKey={b.slug} name={b.name} stackId="brands" stroke={BRAND_COLORS[i % BRAND_COLORS.length]} fill={BRAND_COLORS[i % BRAND_COLORS.length]} fillOpacity={0.25} strokeWidth={2} />
          ))}
          <Line type="monotone" dataKey="prev" name="Período anterior" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {byBrand.map((b, i) => (
          <span key={b.slug} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />{b.name}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-slate-400" />Total {compareLabel.replace(/^vs\. /, '')}</span>
      </div>
    </div>
  )
}
