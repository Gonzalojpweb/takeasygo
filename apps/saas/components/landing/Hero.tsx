'use client'

// ============================================================================
// Landing — hero
// ============================================================================
// Mantiene el bloque naranja redondeado y el titular serif con itálica de la
// marca. Cambia el mensaje: ya no es solo «menú y pedidos», es el sistema
// completo (venta online + POS + gestión). Las maquetas son código, no fotos.
// Se quitó la animación atada al scroll (hero fijo con GSAP): era la causa de
// saltos y de secciones que quedaban tapadas.
// ============================================================================

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { Eyebrow, btn, scrollToId } from './brand'
import { NotifCard, PhoneMock, PosMock } from './mockups'

const PROOFS = ['Probá gratis con tus primeros 30 pedidos', 'Con tu marca y tus colores', 'Soporte por WhatsApp']

export default function Hero() {
  const reduce = useReducedMotion()
  const enter = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.65, delay, ease: [0.25, 0.1, 0.25, 1] as const } }

  return (
    <section aria-labelledby="hero-title" className="tgo-on-orange px-3 pt-3 md:px-5 md:pt-5">
      <div className="relative overflow-hidden rounded-[22px] md:rounded-[28px]" style={{ background: 'var(--tgo-orange)' }}>
        {/* Luz de fondo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[30%] -right-[10%] h-[80vw] w-[80vw] max-h-[900px] max-w-[900px]"
          style={{ background: 'radial-gradient(circle, rgba(247,244,241,0.34) 0%, rgba(247,244,241,0.12) 35%, transparent 62%)' }}
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-6 pb-0 pt-28 md:px-10 md:pt-36 lg:grid-cols-[1.02fr_1fr] lg:gap-4 lg:pb-20 lg:pt-40">
          {/* Texto */}
          <div className="max-w-xl">
            <motion.div {...enter(0)}>
              <Eyebrow tone="cream">Infraestructura digital para la gastronomía</Eyebrow>
            </motion.div>

            <motion.h1
              id="hero-title"
              {...enter(0.08)}
              className="tgo-serif mt-7 text-balance text-[clamp(2.5rem,6vw,4.4rem)] leading-[1.03] text-[#0d0b0a]"
            >
              Tu restaurante completo, <em className="italic text-[#f7f4f1]">en un solo sistema.</em>
            </motion.h1>

            <motion.p {...enter(0.18)} className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-[#f7f4f1]">
              Vendé online con tu marca, manejá el salón y la caja con nuestro POS, y decidí con datos reales. Carta digital, pedidos, cobros,
              inventario y club de clientes: todo conectado.
            </motion.p>

            <motion.div {...enter(0.28)} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/empezar" className={btn.ink}>
                Empezar gratis <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => scrollToId('demo')} className={btn.ghostLight}>
                Pedir una demo
              </button>
            </motion.div>

            <motion.ul {...enter(0.38)} className="mt-8 flex flex-col gap-2 text-[13px] font-medium text-[#f7f4f1] sm:flex-row sm:flex-wrap sm:gap-x-6">
              {PROOFS.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span aria-hidden="true" className="flex size-4 items-center justify-center rounded-full bg-[#0d0b0a]/20">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Maquetas */}
          <motion.div {...enter(0.35)} className="relative mx-auto h-[400px] w-full max-w-[620px] sm:h-[460px] lg:h-[540px]">
            {/* POS (desde tablet) */}
            <div className="tgo-float-b absolute left-0 top-6 hidden origin-top-left scale-[0.78] md:block lg:left-[-8px] lg:top-8 lg:scale-[0.94]">
              <PosMock />
            </div>
            {/* Celular */}
            <div className="tgo-float-a absolute bottom-[-70px] left-1/2 origin-bottom -translate-x-1/2 scale-[0.92] md:bottom-[-20px] md:left-auto md:right-0 md:translate-x-0 md:scale-[0.86] lg:bottom-[-36px] lg:right-[-6px] lg:scale-100">
              <PhoneMock />
            </div>
            {/* Avisos */}
            <div className="tgo-float-b absolute left-0 top-10 md:left-auto md:right-[150px] md:top-[-14px] lg:right-[170px] lg:top-[-6px]">
              <NotifCard kind="order" title="Pedido nuevo · Mesa 4" sub="Entró a cocina · ahora" />
            </div>
            <div className="tgo-float-a absolute right-0 top-[150px] md:left-[40px] md:right-auto md:top-auto md:bottom-[60px] lg:left-[20px] lg:bottom-[86px]">
              <NotifCard kind="paid" title="Pago confirmado" sub="$38.200 · Mercado Pago" />
            </div>
            <div className="tgo-float-b absolute bottom-[130px] left-2 hidden sm:flex md:hidden lg:left-[130px] lg:bottom-[6px] lg:flex">
              <NotifCard kind="offline" title="Sin internet: seguís cobrando" sub="Se sincroniza al volver" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
