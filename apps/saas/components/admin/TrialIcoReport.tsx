'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Clock, TrendingUp, AlertTriangle, ShoppingBag, Lightbulb, CheckCircle2, Zap } from 'lucide-react'
import dynamic from 'next/dynamic'

const PlanLeadModal = dynamic(() => import('@/components/landing/PlanLeadModal'), { ssr: false })

interface TrialReportData {
  totalOrders: number
  activeDays: number
  cancRate: number
  tppMinutes: number | null
  tppStdMinutes: number | null
  tppBenchmark: 'rapido' | 'normal' | 'lento' | null
  confirmMinutes: number | null
  onTimePct: number | null
  topItems: { name: string; count: number }[]
  topItemsConcentration: number | null
  peakWindow: { time: string; count: number; pct: number } | null
  recommendations: string[]
}

interface Props {
  data: TrialReportData
  tenantSlug: string
}

const benchmarkConfig = {
  rapido: { label: 'Rápido', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  normal: { label: 'Normal', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  lento:  { label: 'Lento',  color: 'text-amber-600 bg-amber-50 border-amber-200' },
}

export default function TrialIcoReport({ data, tenantSlug }: Props) {
  const [modal, setModal] = useState(false)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="rounded-[2rem] bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent border border-violet-500/20 p-8">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-500 block mb-3">
          Informe de Contexto Operativo
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          Análisis ICO — Tus primeros 30 pedidos
        </h1>
        <p className="text-muted-foreground text-sm">
          Basado en {data.totalOrders} pedidos reales procesados en {data.activeDays} día{data.activeDays !== 1 ? 's' : ''} de actividad.
        </p>
      </div>

      {/* ── Resumen operativo ──────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<TrendingUp size={16} />} label="Resumen operativo" />
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Pedidos procesados" value={String(data.totalOrders)} />
          <StatCard label="Días activos" value={String(data.activeDays)} />
          <StatCard
            label="Tasa de cancelación"
            value={`${data.cancRate}%`}
            badge={data.cancRate > 15 ? { label: 'Alta', color: 'text-amber-600 bg-amber-50' } : { label: 'Baja', color: 'text-emerald-600 bg-emerald-50' }}
          />
        </div>
      </section>

      {/* ── Velocidad de cocina ────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Clock size={16} />} label="Velocidad de cocina" />
        <div className="rounded-2xl border border-border/60 p-6 bg-card">
          {data.tppMinutes !== null ? (
            <div className="flex items-start gap-8">
              <div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-5xl font-bold tracking-tighter text-foreground">{data.tppMinutes}</span>
                  <span className="text-muted-foreground font-medium mb-1">min promedio</span>
                </div>
                {data.tppBenchmark && (
                  <span className={cn('text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border', benchmarkConfig[data.tppBenchmark].color)}>
                    {benchmarkConfig[data.tppBenchmark].label}
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-2 text-xs text-muted-foreground border-l border-border/40 pl-8">
                <RangeRow label="Rápido" range="< 15 min" active={data.tppBenchmark === 'rapido'} color="emerald" />
                <RangeRow label="Normal" range="15 – 22 min" active={data.tppBenchmark === 'normal'} color="blue" />
                <RangeRow label="Lento"  range="> 22 min"   active={data.tppBenchmark === 'lento'}  color="amber" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos de tiempo de preparación suficientes aún.</p>
          )}
          {data.onTimePct !== null && (
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/40">
              <span className="font-bold text-foreground">{data.onTimePct}%</span> de los pedidos estuvo listo dentro del tiempo prometido al cliente.
            </p>
          )}
        </div>
      </section>

      {/* ── Consistencia ──────────────────────────────────────────────── */}
      {data.tppMinutes !== null && data.tppStdMinutes !== null && (
        <section>
          <SectionTitle icon={<Zap size={16} />} label="Consistencia" />
          <div className="rounded-2xl border border-border/60 p-6 bg-card space-y-3">
            <div className="flex gap-8">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Tiempo medio</p>
                <p className="text-2xl font-bold text-foreground">{data.tppMinutes} min</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Desviación</p>
                <p className="text-2xl font-bold text-foreground">± {data.tppStdMinutes} min</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground pt-2 border-t border-border/40">
              {data.tppStdMinutes <= 5
                ? 'Tus tiempos son muy consistentes. El proceso está bien estandarizado.'
                : data.tppStdMinutes <= 8
                ? 'Variación moderada. Algunos pedidos toman significativamente más tiempo que otros.'
                : 'Tus tiempos varían bastante. Esto suele indicar picos de carga o pasos del proceso sin estandarizar.'}
            </p>
          </div>
        </section>
      )}

      {/* ── Cuello de botella ─────────────────────────────────────────── */}
      {data.peakWindow && (
        <section>
          <SectionTitle icon={<AlertTriangle size={16} />} label="Cuello de botella" />
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <p className="text-sm font-medium text-foreground mb-2">
              La franja de las <strong>{data.peakWindow.time}hs</strong> concentró el{' '}
              <strong className="text-amber-600">{data.peakWindow.pct}%</strong> de tus pedidos
              ({data.peakWindow.count} en esa ventana de 30 min).
            </p>
            <p className="text-xs text-muted-foreground">
              {data.peakWindow.pct > 35
                ? 'Concentración alta. Este pico puede generar retrasos y pedidos tarde si el volumen crece.'
                : 'Distribución razonablemente balanceada. El pico no representa un riesgo crítico aún.'}
            </p>
          </div>
        </section>
      )}

      {/* ── Platos más pedidos ────────────────────────────────────────── */}
      {data.topItems.length > 0 && (
        <section>
          <SectionTitle icon={<ShoppingBag size={16} />} label="Platos más pedidos" />
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {data.topItems.map((item, i) => (
              <div key={i} className={cn('flex items-center gap-4 px-6 py-3.5', i > 0 && 'border-t border-border/40')}>
                <span className="text-[10px] font-black text-muted-foreground/50 w-4 text-right">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-foreground">{item.name}</span>
                <span className="text-xs font-bold text-muted-foreground">{item.count} und.</span>
              </div>
            ))}
            {data.topItemsConcentration !== null && (
              <div className="px-6 py-3 bg-muted/30 border-t border-border/40">
                <p className="text-xs text-muted-foreground">
                  El <strong className="text-foreground">{data.topItemsConcentration}%</strong> de tus pedidos proviene de los 3 platos más pedidos.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Recomendaciones ───────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Lightbulb size={16} />} label="Recomendaciones" />
        <div className="space-y-3">
          {data.recommendations.map((rec, i) => (
            <div key={i} className="flex gap-3 p-4 rounded-xl border border-border/60 bg-card">
              <CheckCircle2 size={16} className="text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{rec}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA de conversión ─────────────────────────────────────────── */}
      <section className="rounded-[2rem] border-2 border-border/60 bg-card p-8 space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Tu operación ya tiene patrones
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Con solo 30 pedidos detectamos tiempos de cocina, picos de demanda y platos dominantes.
            Pero esto es solo el comienzo.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {['Análisis mensual', 'Evolución de tiempos', 'Reportes comparativos', 'Alertas operativas', 'Múltiples sedes'].map(f => (
              <span key={f} className="text-[10px] font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {f}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setModal(true)}
          className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[11px] hover:bg-primary/90 transition-all active:scale-95 shadow-xl shadow-primary/20"
        >
          Activar análisis continuo
        </button>
        <p className="text-[10px] text-muted-foreground text-center">
          Plan mínimo sugerido: <strong>Crecimiento</strong> · Podés continuar con la operación básica durante la transición.
        </p>
      </section>

      {modal && (
        <PlanLeadModal
          plan="Crecimiento – Plan recomendado"
          planId="crecimiento-mensual"
          onClose={() => setModal(false)}
        />
      )}
    </div>
  )
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-primary">{icon}</span>
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{label}</h2>
    </div>
  )
}

function StatCard({ label, value, badge }: { label: string; value: string; badge?: { label: string; color: string } }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 text-center">
      <p className="text-3xl font-bold tracking-tight text-foreground mb-1">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      {badge && (
        <span className={cn('mt-2 inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full', badge.color)}>
          {badge.label}
        </span>
      )}
    </div>
  )
}

function RangeRow({ label, range, active, color }: { label: string; range: string; active: boolean; color: string }) {
  return (
    <div className={cn('flex justify-between', active && `text-${color}-600 font-bold`)}>
      <span>{label}</span>
      <span>{range}</span>
    </div>
  )
}
