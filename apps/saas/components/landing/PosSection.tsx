'use client'

// ============================================================================
// Landing — el POS (sección nueva: antes la web no lo mencionaba)
// ============================================================================
// Cada punto describe algo que el POS ya hace: plano de mesas, comandas por
// sector, cobro dividido y propinas, caja por turnos con reporte Z, factura
// electrónica e impresora fiscal, modo sin internet, PIN por usuario y
// descuentos con autorización.
// ============================================================================

import { ArrowRight, FileCheck2, KeyRound, LayoutGrid, Printer, Split, Vault, WifiOff, Workflow } from 'lucide-react'
import { Eyebrow, Reveal, SectionTitle, btn, scrollToId } from './brand'
import { NotifCard, PayChips, PosMock } from './mockups'

const FEATURES = [
  { icon: LayoutGrid, title: 'Plano del salón', text: 'Tus mesas como están en el local, con su estado en vivo: libre, ocupada, pidió la cuenta, pagada.' },
  { icon: Printer, title: 'Comandas por sector', text: 'Cocina, barra y caja reciben lo suyo, cada una en su impresora. Marchás entradas y principales cuando corresponde.' },
  { icon: Split, title: 'Cobro flexible', text: 'Dividí la cuenta, combiná medios de pago y sumá la propina. El vuelto lo calcula solo.' },
  { icon: Vault, title: 'Caja por turnos', text: 'Apertura, gastos, arqueo por billetes y cierre con reporte Z. Sabés quién cobró qué y cuándo.' },
  { icon: FileCheck2, title: 'Facturación en regla', text: 'Factura electrónica ARCA A, B y C, notas de crédito y compatibilidad con impresora fiscal.' },
  { icon: WifiOff, title: 'Sigue sin internet', text: 'Se cortó la conexión: seguís tomando pedidos, cobrando e imprimiendo. Al volver, se sincroniza solo.' },
  { icon: KeyRound, title: 'Cada uno con su PIN', text: 'Mozos, cajeros y encargados con su rol. Descuentos y anulaciones piden motivo y autorización.' },
  { icon: Workflow, title: 'Conectado a todo', text: 'Los pedidos de la web y de las apps de delivery entran al mismo lugar. Cada venta descuenta el stock y suma puntos.' },
]

export default function PosSection() {
  return (
    <section id="pos" aria-labelledby="pos-title" className="px-3 py-3 md:px-5">
      <div className="overflow-hidden rounded-[22px] bg-[#0d0b0a] text-[#f7f4f1] md:rounded-[28px]">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1fr]">
            <Reveal>
              <Eyebrow>POS TakeasyGO</Eyebrow>
              <SectionTitle tone="cream" id="pos-title" lead="Un punto de venta pensado" accent="para el servicio real." className="mt-6 text-[clamp(2rem,4.4vw,3.4rem)]" />
              <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-white/70">
                El mismo sistema que recibe tus pedidos online maneja el salón, la barra y la caja. No hay integraciones que mantener ni pedidos que
                pasar a mano: es una sola herramienta.
              </p>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/55">
                Se instala en la computadora o tablet que ya tenés (Windows o Android) y se suma a cualquier plan.
              </p>
              <div className="mt-7">
                <PayChips dark />
              </div>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => scrollToId('demo')} className={btn.orange}>
                  Quiero ver el POS <ArrowRight size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => scrollToId('planes')} className={btn.ghostLight}>
                  Ver planes
                </button>
              </div>
            </Reveal>

            <Reveal delay={0.1} className="relative mx-auto h-[300px] w-full max-w-[600px] sm:h-[380px] lg:h-[400px]">
              <div className="absolute left-1/2 top-2 origin-top -translate-x-1/2 scale-[0.6] sm:scale-[0.82] lg:left-0 lg:translate-x-0 lg:origin-top-left lg:scale-100">
                <PosMock className="border-white/15" />
              </div>
              <div className="tgo-float-a absolute bottom-0 right-0 hidden sm:block">
                <NotifCard kind="kitchen" title="Comanda impresa · Cocina" sub="Mesa 4 · 3 principales" />
              </div>
            </Reveal>
          </div>

          <ul className="mt-16 grid gap-px overflow-hidden rounded-[22px] bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="bg-[#0d0b0a]">
                <Reveal delay={(i % 4) * 0.05} className="h-full p-6 md:p-7">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.07] text-[#f14722]">
                    <f.icon size={19} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[1.02rem] font-bold">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/60">{f.text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
