'use client'

// ============================================================================
// Landing — «Plataforma»: cinta de capacidades, los 4 frentes y el recorrido
// de un pedido online
// ============================================================================
// Antes la web hablaba solo del menú y los pedidos. Acá se presenta el sistema
// entero en cuatro frentes, cada uno con un enlace a su sección.
// ============================================================================

import { ArrowUpRight, BarChart3, ChefHat, CreditCard, HeartHandshake, MonitorSmartphone, QrCode, ShoppingBag, Smartphone, Store } from 'lucide-react'
import { Eyebrow, Reveal, SectionTitle, scrollToId } from './brand'

const CAPABILITIES = [
  'Carta digital',
  'Pedidos online',
  'POS para salón y caja',
  'Factura electrónica ARCA',
  'Funciona sin internet',
  'Mercado Pago',
  'Inventario por recetas',
  'Club de clientes',
  'Reservas con seña',
  'Delivery por zonas',
  'Combos y promociones',
  'Varias sedes y marcas',
]

export function CapabilityStrip() {
  const row = [...CAPABILITIES, ...CAPABILITIES]
  return (
    <div className="tgo-marquee overflow-hidden border-b border-[var(--tgo-line)] py-5" aria-label="Lo que incluye TakeasyGO">
      <ul className="tgo-marquee-track">
        {row.map((c, i) => (
          <li key={i} aria-hidden={i >= CAPABILITIES.length} className="tgo-sans flex items-center gap-8 pr-8 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0d0b0a]/70">
            {c}
            <span aria-hidden="true" className="block size-1.5 rounded-full bg-[#f14722]" />
          </li>
        ))}
      </ul>
    </div>
  )
}

const PILLARS = [
  {
    icon: Store,
    n: '01',
    title: 'Vendé online',
    line: 'Tu carta, tu marca, tus clientes.',
    points: ['Carta digital con fotos y personalización', 'Pedidos para retirar, delivery y en la mesa', 'Combos, promociones y cupones por QR', 'Mercado Pago, transferencia y efectivo'],
    to: 'como-funciona',
    cta: 'Ver cómo funciona',
  },
  {
    icon: MonitorSmartphone,
    n: '02',
    title: 'Operá el salón',
    line: 'El POS que ordena el servicio.',
    points: ['Plano de mesas en vivo', 'Comandas a cocina y barra', 'Caja por turnos con cierre Z', 'Factura electrónica y modo sin internet'],
    to: 'pos',
    cta: 'Conocer el POS',
    featured: true,
  },
  {
    icon: BarChart3,
    n: '03',
    title: 'Gestioná con datos',
    line: 'Sabé qué entra, qué sale y qué deja.',
    points: ['Inventario por recetas con guía paso a paso', 'Precios actualizados en minutos', 'Reportes, horas pico y recompra', 'Varias sedes y marcas de un vistazo'],
    to: 'gestion',
    cta: 'Ver la gestión',
  },
  {
    icon: HeartHandshake,
    n: '04',
    title: 'Hacé que vuelvan',
    line: 'Clientes propios, no prestados.',
    points: ['Club de puntos y tienda de canje', 'Premios escondidos en la carta', '«Invitá y ganá» con referidos', 'Base de clientes y reservas con seña'],
    to: 'gestion',
    cta: 'Ver fidelización',
  },
]

export function Ecosystem() {
  return (
    <section id="plataforma" aria-labelledby="plataforma-title" className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-3xl">
          <Eyebrow>Una plataforma, cuatro frentes</Eyebrow>
          <SectionTitle id="plataforma-title" lead="Todo lo que tu local necesita," accent="hablando el mismo idioma." className="mt-6 text-[clamp(2rem,4.4vw,3.4rem)]" />
          <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--tgo-muted)]">
            Un pedido de la web entra solo a la cocina y a la caja. La venta descuenta el stock. El cliente suma puntos. Vos lo ves en un reporte. Sin
            planillas ni sistemas que no se hablan entre sí.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PILLARS.map((p, i) => (
            <li key={p.n}>
              <Reveal delay={i * 0.07} className="h-full">
                <article
                  className={
                    p.featured
                      ? 'flex h-full flex-col rounded-[26px] bg-[#0d0b0a] p-7 text-[#f7f4f1]'
                      : 'flex h-full flex-col rounded-[26px] border border-[var(--tgo-line)] bg-white p-7'
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className={p.featured ? 'flex size-12 items-center justify-center rounded-2xl bg-[#f14722] text-white' : 'flex size-12 items-center justify-center rounded-2xl bg-[#f14722]/10 text-[#f14722]'}>
                      <p.icon size={22} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <span className={p.featured ? 'text-xs font-semibold tabular-nums text-white/40' : 'text-xs font-semibold tabular-nums text-zinc-400'}>{p.n}</span>
                  </div>
                  <h3 className="tgo-serif mt-6 text-[1.7rem] leading-tight">{p.title}</h3>
                  <p className={p.featured ? 'mt-1 text-sm text-white/60' : 'mt-1 text-sm text-[var(--tgo-muted)]'}>{p.line}</p>
                  <ul className="mt-5 space-y-2.5 text-[14px] leading-snug">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-[7px] block size-1.5 shrink-0 rounded-full bg-[#f14722]" />
                        <span className={p.featured ? 'text-white/85' : 'text-zinc-700'}>{pt}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`#${p.to}`}
                    onClick={(e) => {
                      e.preventDefault()
                      scrollToId(p.to)
                    }}
                    className={
                      p.featured
                        ? 'mt-auto inline-flex min-h-11 items-center gap-1.5 pt-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#f14722]'
                        : 'mt-auto inline-flex min-h-11 items-center gap-1.5 pt-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0d0b0a] hover:text-[#f14722]'
                    }
                  >
                    {p.cta} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const STEPS = [
  { icon: QrCode, title: 'Tu cliente entra', text: 'Escanea el QR de la mesa, toca el link de tu Instagram o te encuentra en la app TakeasyGO. Sin descargar nada.' },
  { icon: ShoppingBag, title: 'Arma su pedido', text: 'Elige platos, combos y extras. La carta le sugiere qué sumar y le muestra lo que ahorra.' },
  { icon: CreditCard, title: 'Paga como quiere', text: 'Mercado Pago, transferencia o efectivo. La plata va directo a tu cuenta.' },
  { icon: ChefHat, title: 'Cocina lo recibe', text: 'La comanda se imprime sola en el sector que corresponde y el pedido aparece en la caja.' },
  { icon: Smartphone, title: 'Lo sigue en vivo', text: 'Ve el estado desde el celular y recibe el aviso cuando está listo. Vos dejás de atender el teléfono.' },
]

export function OnlineFlow() {
  return (
    <section id="como-funciona" aria-labelledby="flujo-title" className="border-y border-[var(--tgo-line)] bg-white px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow center>Venta online</Eyebrow>
          <SectionTitle id="flujo-title" lead="Del antojo al pedido listo," accent="sin que nadie atienda el teléfono." className="mt-6 text-[clamp(2rem,4.4vw,3.2rem)]" />
        </Reveal>

        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 0.06} className="h-full">
                <div className="relative h-full rounded-[22px] bg-[var(--tgo-cream)] p-6">
                  <span className="tgo-serif absolute right-5 top-4 text-4xl text-[#0d0b0a]/10" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-white text-[#f14722] shadow-sm">
                    <s.icon size={20} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[1.05rem] font-bold leading-snug">
                    <span className="sr-only">Paso {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--tgo-muted)]">{s.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
