'use client'

// ============================================================================
// Landing — Premium y Élite (sección nueva)
// ============================================================================
// Premium: datos avanzados y más capacidad. Élite: todo Premium + asistente
// TEO + precios desde planilla o desde una foto de la carta + soporte
// prioritario. Lo que se lista sale de PLAN_ACCESS / PLAN_FEATURES_LANDING.
// ============================================================================

import { ArrowRight, Check, Crown, Gauge } from 'lucide-react'
import { Eyebrow, Reveal, SectionTitle, btn, scrollToId } from './brand'
import { ImportMock, ReportMock, TeoMock } from './mockups'

const PREMIUM = [
  'Analítica avanzada: recompra, hora pico y rendimiento de la carta',
  'Diagnóstico operativo completo, factor por factor',
  'Tienda de canje de puntos y premios escondidos sin límite',
  'Cobro en efectivo también en los pedidos online',
  'Dos equipos del POS operando sin internet por sede',
  'Hasta 4 impresoras por sede',
]

const ELITE = [
  { title: 'TEO, tu asistente', text: 'Le preguntás cómo hacer algo y te responde en el momento, dentro del panel. Como tener a soporte sentado al lado.' },
  { title: 'Precios desde tu planilla', text: 'Subís el Excel con la lista nueva y el sistema encuentra cada plato y te muestra qué cambia antes de aplicar.' },
  { title: 'Precios desde una foto de la carta', text: 'Sacale una foto o subí el PDF de la carta nueva: la leemos y te proponemos los cambios. Vos revisás y aprobás.' },
  { title: 'Soporte prioritario', text: 'Tus consultas van primero, con seguimiento de una persona del equipo.' },
]

export default function EliteSection() {
  return (
    <section id="elite" aria-labelledby="elite-title" className="border-t border-[var(--tgo-line)] bg-white px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow center>Premium y Élite</Eyebrow>
          <SectionTitle id="elite-title" lead="Para los que ya venden bien" accent="y quieren vender mejor." className="mt-6 text-[clamp(2rem,4.4vw,3.4rem)]" />
          <p className="mx-auto mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--tgo-muted)]">
            Cuando el local ya funciona, la diferencia está en los detalles: saber qué plato deja plata, a qué hora reforzar la cocina y no perder una
            tarde actualizando precios.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          {/* Premium */}
          <Reveal className="h-full">
            <article className="flex h-full flex-col rounded-[28px] border border-[var(--tgo-line)] bg-[var(--tgo-cream)] p-7 md:p-9">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-white text-[#f14722]">
                  <Gauge size={21} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="tgo-serif text-[1.9rem] leading-none">Premium</h3>
                  <p className="mt-1 text-[13px] font-medium text-[var(--tgo-muted)]">Optimizá con datos</p>
                </div>
              </div>
              <ul className="mt-7 space-y-3 text-[14.5px] leading-snug text-zinc-700">
                {PREMIUM.map((p) => (
                  <li key={p} className="flex gap-3">
                    <Check size={17} strokeWidth={2.4} className="mt-0.5 shrink-0 text-[#f14722]" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-7">
                <ReportMock />
              </div>
            </article>
          </Reveal>

          {/* Élite */}
          <Reveal delay={0.08} className="h-full">
            <article className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-[#0d0b0a] p-7 text-[#f7f4f1] md:p-9">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(241,71,34,0.38) 0%, transparent 65%)' }}
              />
              <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#f14722] text-white">
                    <Crown size={21} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="tgo-serif text-[1.9rem] leading-none">Élite</h3>
                    <p className="mt-1 text-[13px] font-medium text-white/55">Todo Premium, más un equipo a tu lado</p>
                  </div>
                </div>
                <span className="rounded-full border border-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">El plan más completo</span>
              </div>

              <div className="relative mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {ELITE.map((e) => (
                  <div key={e.title}>
                    <h4 className="text-[1.02rem] font-bold">{e.title}</h4>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{e.text}</p>
                  </div>
                ))}
              </div>

              <div className="relative mt-8 grid gap-3 sm:grid-cols-2">
                <TeoMock />
                <ImportMock />
              </div>

              <div className="relative mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:items-center">
                <button type="button" onClick={() => scrollToId('demo')} className={btn.orange}>
                  Hablar con el equipo <ArrowRight size={15} aria-hidden="true" />
                </button>
                <p className="text-[13px] text-white/50">Élite se activa con acompañamiento: lo configuramos con vos.</p>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
