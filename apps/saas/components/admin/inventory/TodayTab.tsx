'use client'

// ============================================================================
// Hoy — "Verificá estos N" + alertas
// ============================================================================
// No es "contá todo": el sistema pide solo lo que vale más que interrumpir
// a esta hora, y explica por qué (FASE01 §11, D-13).
// ============================================================================

import { useState } from 'react'
import { AlertTriangle, ClipboardCheck, Loader2, PackageOpen, ShieldCheck } from 'lucide-react'
import QuickCapture from './QuickCapture'
import { EmptyState, SectionCard, estimate, inventoryApi, pesos, qty, useAsyncData } from './shared'

interface Verification {
  skuId: string
  storageLocationId: string
  storageName: string
  name: string
  unit: string
  mu: number
  sigma: number
  anchored: boolean
  valueAtRiskCents: number
  interruptionCostCents: number
  reasons: string[]
}

interface Alert {
  skuId: string
  storageLocationId: string
  storageName: string
  name: string
  unit: string
  mu: number
  sigma: number
  stockAlert: 'out' | 'low' | null
  negative: boolean
  coverageDays: number | null
}

interface TodayData {
  localHour: number
  verifications: Verification[]
  alerts: Alert[]
  totals: { skus: number; neverCounted: number; stockValueCents: number }
  untouched: Array<{ skuId: string; name: string; unit: string }>
  storages: Array<{ id: string; name: string; isDefaultConsumption: boolean }>
}

export default function TodayTab({ tenantSlug, locationId, showValues }: { tenantSlug: string; locationId: string; showValues: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const { data, loading, reload: load } = useAsyncData(
    () => inventoryApi<TodayData>(tenantSlug, `today?locationId=${locationId}`),
    `${tenantSlug}|${locationId}`,
  )

  if (loading && !data) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
  }
  if (!data) return null

  const consumption = data.storages.find((s) => s.isDefaultConsumption)
  const done = () => {
    setOpen(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Insumos seguidos" value={String(data.totals.skus)} />
        <Stat label="Sin conteo inicial" value={String(data.totals.neverCounted)} warn={data.totals.neverCounted > 0} />
        {showValues && <Stat label="Stock valorizado (estimado)" value={pesos(data.totals.stockValueCents)} />}
      </div>

      <SectionCard
        title={data.verifications.length > 0 ? `Verificá estos ${data.verifications.length}` : 'Nada para verificar ahora'}
        subtitle={`Solo lo que vale más que interrumpir a esta hora (${data.localHour}:00). Un conteo de 30 segundos recalibra todo lo demás.`}
      >
        {data.verifications.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} text="Con la evidencia actual no hace falta interrumpir a nadie. La lista se actualiza sola con las ventas y el paso del tiempo." />
        ) : (
          <ul className="space-y-3">
            {data.verifications.map((v) => {
              const key = `${v.skuId}|${v.storageLocationId}`
              return (
                <li key={key} className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{v.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.storageName} · {v.anchored ? `el sistema estima ${estimate(v.mu, v.sigma, v.unit)}` : 'sin conteo inicial'}
                      </div>
                      <ul className="mt-2 space-y-0.5 text-sm">
                        {v.reasons.map((r) => (
                          <li key={r} className="text-foreground/80">· {r}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="text-right">
                      {showValues && (
                        <div className="text-xs text-muted-foreground">
                          Protege <span className="font-black text-foreground">{pesos(v.valueAtRiskCents)}</span>
                        </div>
                      )}
                      <button type="button" onClick={() => setOpen(open === key ? null : key)} className="mt-2 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
                        <ClipboardCheck size={16} /> Contar
                      </button>
                    </div>
                  </div>
                  {open === key && (
                    <QuickCapture tenantSlug={tenantSlug} skuId={v.skuId} storageLocationId={v.storageLocationId} unit={v.unit} mode="count" onDone={done} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Alertas" subtitle="Faltantes probables (con 90 % de confianza) e inconsistencias entre ventas y stock.">
        {data.alerts.length === 0 ? (
          <EmptyState icon={<PackageOpen />} text="Sin faltantes previstos para los próximos 2 días." />
        ) : (
          <ul className="divide-y divide-border">
            {data.alerts.map((a) => (
              <li key={`${a.skuId}|${a.storageLocationId}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={18} className={a.negative || a.stockAlert === 'out' ? 'text-red-600' : 'text-amber-600'} />
                  <div>
                    <div className="font-bold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.negative
                        ? `Se vendió más de lo registrado (${qty(a.mu, a.unit)}): falta una recepción o hay que revisar la receta`
                        : a.stockAlert === 'out'
                          ? 'Sin stock estimado'
                          : `Puede faltar: ${estimate(a.mu, a.sigma, a.unit)}${a.coverageDays !== null ? ` · alcanza ~${a.coverageDays} días` : ''}`}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{a.storageName}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {data.untouched.length > 0 && consumption && (
        <SectionCard title="Conteo inicial pendiente" subtitle="Insumos que todavía no tienen línea base. Contalos una vez y el sistema los sigue solo.">
          <ul className="space-y-2">
            {data.untouched.map((u) => (
              <li key={u.skuId} className="rounded-2xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{u.name}</span>
                  <button type="button" onClick={() => setOpen(open === u.skuId ? null : u.skuId)} className="h-11 rounded-xl border border-border px-4 text-sm font-bold">
                    Contar
                  </button>
                </div>
                {open === u.skuId && (
                  <QuickCapture tenantSlug={tenantSlug} skuId={u.skuId} storageLocationId={consumption.id} unit={u.unit} mode="count" onDone={done} />
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-border/60 bg-card p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-black ${warn ? 'text-amber-600' : ''}`}>{value}</div>
    </div>
  )
}
