'use client'

// ============================================================================
// Landing — «Gestión»: inventario, precios, reportes, club y grupo
// ============================================================================
// Tarjetas con una maqueta chica de cada herramienta. La etiqueta dice desde
// qué plan está disponible (según packages/business/src/plans.ts).
// ============================================================================

import { CalendarCheck, MapPinned, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Eyebrow, Reveal, SectionTitle } from './brand'
import { ClubMock, GroupMock, GuideMock, PricesMock, ReportMock } from './mockups'

function Card({
  title,
  text,
  plan,
  children,
  className,
  delay = 0,
}: {
  title: string
  text: string
  plan: string
  children?: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <li className={className}>
      <Reveal delay={delay} className="h-full">
        <article className="flex h-full flex-col rounded-[26px] border border-[var(--tgo-line)] bg-white p-6 md:p-7">
          <span className="w-fit rounded-full bg-[var(--tgo-cream)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tgo-muted)]">{plan}</span>
          <h3 className="tgo-serif mt-4 text-[1.6rem] leading-tight">{title}</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--tgo-muted)]">{text}</p>
          {children && <div className="mt-auto pt-6">{children}</div>}
        </article>
      </Reveal>
    </li>
  )
}

const EXTRAS = [
  { icon: UsersRound, title: 'Base de clientes', text: 'Quién te compra, cada cuánto y quién dejó de venir. Segmentos listos para una campaña.' },
  { icon: CalendarCheck, title: 'Reservas con seña', text: 'El cliente reserva y paga la seña online. Menos mesas vacías por ausencias.' },
  { icon: MapPinned, title: 'App TakeasyGO', text: 'Tu local aparece en el mapa de la ciudad, con tus promos, para quien busca dónde comer cerca.' },
]

export default function ManageSection() {
  return (
    <section id="gestion" aria-labelledby="gestion-title" className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-3xl">
          <Eyebrow>Gestión y fidelización</Eyebrow>
          <SectionTitle id="gestion-title" lead="El control que antes pedía" accent="tres sistemas y una planilla." className="mt-6 text-[clamp(2rem,4.4vw,3.4rem)]" />
          <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--tgo-muted)]">
            Herramientas pensadas para quien está en el local, no para un contador: en idioma de cocina, con guías que te dicen qué hacer y por qué.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-6">
          <Card
            className="lg:col-span-3"
            plan="Desde Crecimiento"
            title="Inventario que se explica solo"
            text="Cargás la receta de cada plato y cada venta descuenta sola. Una guía en vivo te acompaña paso a paso y te avisa, con los números, si algo no cierra."
          >
            <GuideMock />
          </Card>
          <Card
            className="lg:col-span-3"
            delay={0.06}
            plan="Todos los planes"
            title="Precios actualizados en minutos"
            text="Subí por categoría o por porcentaje, redondeá, programá el cambio para el lunes y deshacelo si te equivocaste. Se acabó editar plato por plato."
          >
            <PricesMock />
          </Card>
          <Card
            className="lg:col-span-2"
            plan="Desde Crecimiento"
            title="Reportes que se entienden"
            text="Ventas, horas pico, platos que suben y bajan, recompra y un puntaje de cómo viene tu operación."
          >
            <ReportMock />
          </Card>
          <Card
            className="lg:col-span-2"
            delay={0.06}
            plan="Todos los planes"
            title="Club de clientes"
            text="Puntos por cada compra, premios escondidos en la carta y «Invitá y ganá» para que te recomienden."
          >
            <ClubMock />
          </Card>
          <Card
            className="md:col-span-2 lg:col-span-2"
            delay={0.12}
            plan="Desde Crecimiento"
            title="Varias sedes, varias marcas"
            text="Todo tu grupo en una pantalla: qué sede empuja, cuál cae y un resumen cada lunes en tu mail."
          >
            <GroupMock />
          </Card>
        </ul>

        <ul className="mt-5 grid gap-5 md:grid-cols-3">
          {EXTRAS.map((e, i) => (
            <li key={e.title}>
              <Reveal delay={i * 0.06} className={cn('flex h-full gap-4 rounded-[22px] bg-[var(--tgo-cream-deep)] p-6')}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#f14722]">
                  <e.icon size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[1.02rem] font-bold">{e.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--tgo-muted)]">{e.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
