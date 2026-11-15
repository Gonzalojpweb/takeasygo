'use client'

// ============================================================================
// Landing — planes
// ============================================================================
// Cuatro planes (antes faltaba Élite), con pago mensual o anual (15% menos).
// Los precios y las listas salen de packages/business/src/plans.ts
// (PLAN_FEATURES_LANDING): una sola fuente, igual que el panel.
// «Quiero este plan» abre el formulario de contacto (POST /api/leads), como
// hasta ahora; «Empezar gratis» lleva al alta autogestionada (/empezar).
// ============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, Handshake } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLAN_FEATURES_LANDING } from '@/lib/plans'
import PlanLeadModal from './PlanLeadModal'
import { Eyebrow, Reveal, SectionTitle } from './brand'

type Billing = 'mensual' | 'anual'
type PlanKey = 'try' | 'buy' | 'full' | 'high'

interface PlanDef {
  key: PlanKey
  name: string
  forWho: string
  monthly: string
  /** Total anual con 15% de descuento (null = se conversa). */
  yearly: string | null
  yearlyFull: string | null
  saving: string | null
  featured?: boolean
  dark?: boolean
}

const PLANS: PlanDef[] = [
  { key: 'try', name: 'Inicial', forWho: 'Para empezar a vender online', monthly: '35.000', yearly: '357.000', yearlyFull: '420.000', saving: '63.000' },
  { key: 'buy', name: 'Crecimiento', forWho: 'Para ordenar y escalar la operación', monthly: '45.000', yearly: '459.000', yearlyFull: '540.000', saving: '81.000', featured: true },
  { key: 'full', name: 'Premium', forWho: 'Para optimizar con datos', monthly: '60.000', yearly: '612.000', yearlyFull: '720.000', saving: '108.000' },
  { key: 'high', name: 'Élite', forWho: 'El servicio completo, con asistente', monthly: '100.000', yearly: null, yearlyFull: null, saving: null, dark: true },
]

function PlanCard({ plan, billing, onChoose }: { plan: PlanDef; billing: Billing; onChoose: () => void }) {
  const [more, setMore] = useState(false)
  const features = PLAN_FEATURES_LANDING[plan.key]
  const annual = billing === 'anual' && plan.yearly !== null
  const price = annual ? plan.yearly! : plan.monthly
  const listId = `plan-${plan.key}-extra`

  return (
    <article
      className={cn(
        'relative flex h-full flex-col rounded-[26px] p-7',
        plan.dark ? 'bg-[#0d0b0a] text-[#f7f4f1]' : 'bg-white',
        plan.featured ? 'border-2 border-[#f14722] shadow-[0_30px_60px_-24px_rgba(241,71,34,0.35)]' : plan.dark ? 'border border-[#0d0b0a]' : 'border border-[var(--tgo-line)]',
      )}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-7 rounded-full bg-[#f14722] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">El más elegido</span>
      )}
      <h3 className="tgo-serif text-[1.8rem] leading-none">{plan.name}</h3>
      <p className={cn('mt-2 text-[13.5px]', plan.dark ? 'text-white/55' : 'text-[var(--tgo-muted)]')}>{plan.forWho}</p>

      <div className="mt-6 min-h-[92px]">
        {annual && (
          <p className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
            <s className={plan.dark ? 'text-white/40' : 'text-zinc-400'}>${plan.yearlyFull}</s>
            <span className="rounded-full bg-[#f14722]/12 px-2 py-0.5 text-[11px] font-bold text-[#f14722]">Ahorrás ${plan.saving}</span>
          </p>
        )}
        <p className="flex items-baseline gap-1.5">
          <span className="text-[2.5rem] font-bold leading-none tracking-tight tabular-nums">${price}</span>
          <span className={cn('text-sm font-medium', plan.dark ? 'text-white/50' : 'text-zinc-500')}>{annual ? '/año' : '/mes'}</span>
        </p>
        <p className={cn('mt-2 text-[12.5px] leading-snug', plan.dark ? 'text-white/45' : 'text-zinc-500')}>
          {plan.yearly === null
            ? 'Pesos argentinos. Se activa con acompañamiento del equipo.'
            : annual
              ? 'Pesos argentinos. Un pago anual anticipado.'
              : `Pesos argentinos. Con pago anual ahorrás $${plan.saving}.`}
        </p>
      </div>

      <button
        type="button"
        onClick={onChoose}
        className={cn(
          'mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors',
          plan.featured || plan.dark ? 'bg-[#f14722] text-white hover:bg-[#d93a18]' : 'bg-[#0d0b0a] text-[#f7f4f1] hover:bg-[#2a2421]',
        )}
      >
        {plan.dark ? 'Hablar con el equipo' : 'Quiero este plan'} <ArrowRight size={14} aria-hidden="true" />
      </button>

      <ul className={cn('mt-7 space-y-3 text-[14px] leading-snug', plan.dark ? 'text-white/85' : 'text-zinc-700')}>
        {features.featured.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check size={16} strokeWidth={2.4} className="mt-0.5 shrink-0 text-[#f14722]" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      {features.extra.length > 0 && (
        <>
          <ul id={listId} hidden={!more} className={cn('mt-3 space-y-3 text-[14px] leading-snug', plan.dark ? 'text-white/65' : 'text-zinc-600')}>
            {features.extra.map((f) => (
              <li key={f} className="flex gap-2.5">
                <Check size={16} strokeWidth={2} className={cn('mt-0.5 shrink-0', plan.dark ? 'text-white/40' : 'text-zinc-400')} aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            aria-controls={listId}
            className={cn('mt-auto inline-flex min-h-11 items-center gap-1.5 pt-5 text-[12px] font-semibold uppercase tracking-[0.1em]', plan.dark ? 'text-white/60 hover:text-white' : 'text-zinc-500 hover:text-zinc-900')}
          >
            {more ? 'Ver menos' : `Ver todo (${features.extra.length} más)`}
            <ChevronDown size={15} aria-hidden="true" className={cn('transition-transform', more && 'rotate-180')} />
          </button>
        </>
      )}
    </article>
  )
}

export default function Pricing() {
  const [billing, setBilling] = useState<Billing>('mensual')
  const [modal, setModal] = useState<{ plan: string; planId: string } | null>(null)

  return (
    <section id="planes" aria-labelledby="planes-title" className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow center>Planes</Eyebrow>
          <SectionTitle id="planes-title" lead="Elegí según dónde estás hoy." accent="Cambiás cuando quieras." className="mt-6 text-[clamp(2rem,4.4vw,3.4rem)]" />
          <p className="mx-auto mt-6 max-w-xl text-[1.05rem] leading-relaxed text-[var(--tgo-muted)]">
            Precio fijo por mes, sin letra chica. El POS TakeasyGO se suma a cualquier plan.
          </p>

          <div role="group" aria-label="Forma de pago" className="mx-auto mt-9 flex w-fit items-center gap-1 rounded-full border border-[var(--tgo-line)] bg-white p-1">
            {(['mensual', 'anual'] as Billing[]).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={billing === b}
                onClick={() => setBilling(b)}
                className={cn(
                  'min-h-11 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors sm:px-7',
                  billing === b ? 'bg-[#0d0b0a] text-[#f7f4f1]' : 'text-zinc-500 hover:text-zinc-900',
                )}
              >
                {b === 'mensual' ? 'Mensual' : 'Anual · 15% menos'}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Prueba gratis */}
        <Reveal className="mt-12">
          <div className="flex flex-col items-start justify-between gap-5 rounded-[26px] bg-[#f14722] p-7 text-white md:flex-row md:items-center md:p-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">Prueba gratis</p>
              <p className="tgo-serif mt-2 text-[1.7rem] leading-tight">Tus primeros 30 pedidos, sin pagar nada.</p>
              <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-white/85">
                Armás la carta, cobrás con Mercado Pago y, al llegar a 30 pedidos, te damos un informe de cómo viene tu operación.
              </p>
            </div>
            <Link
              href="/empezar"
              className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#0d0b0a] px-7 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#f7f4f1] transition-colors hover:bg-[#2a2421]"
            >
              Empezar gratis <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        <ul className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p, i) => (
            <li key={p.key}>
              <Reveal delay={i * 0.06} className="h-full">
                <PlanCard
                  plan={p}
                  billing={billing}
                  onChoose={() => {
                    const annual = billing === 'anual' && p.yearly !== null
                    setModal({ plan: `${p.name} – $${annual ? p.yearly : p.monthly}${annual ? '/año' : '/mes'}`, planId: `${p.key}-${annual ? 'anual' : 'mensual'}` })
                  }}
                />
              </Reveal>
            </li>
          ))}
        </ul>

        {billing === 'anual' && (
          <p className="mx-auto mt-8 max-w-xl text-center text-[13px] leading-relaxed text-zinc-500">
            El pago anual se abona por adelantado y equivale a 10,2 meses de servicio. Mismo plan y mismas funciones.
          </p>
        )}

        {/* Socios */}
        <Reveal className="mt-14">
          <div className="flex flex-col items-start gap-6 rounded-[26px] border border-[var(--tgo-line)] bg-white p-7 md:flex-row md:items-center md:p-9">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#f14722]/10 text-[#f14722]">
              <Handshake size={25} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#f14722]">Programa de socios</p>
              <h3 className="mt-1.5 text-xl font-bold tracking-tight md:text-2xl">Ganá un 15% por cada local que recomiendes.</h3>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[var(--tgo-muted)]">
                Recibís el 15% del valor de la licencia por cada cliente que se sume gracias a vos. Un pago único al cerrar la venta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModal({ plan: 'Socio estratégico – 15% por referido', planId: 'socio-estrategico' })}
              className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-[#0d0b0a] px-7 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#f7f4f1] transition-colors hover:bg-[#f14722]"
            >
              Quiero ser socio
            </button>
          </div>
        </Reveal>
      </div>

      {modal && <PlanLeadModal plan={modal.plan} planId={modal.planId} onClose={() => setModal(null)} />}
    </section>
  )
}
