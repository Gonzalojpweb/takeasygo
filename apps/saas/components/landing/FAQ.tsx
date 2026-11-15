// ============================================================================
// Landing — preguntas frecuentes
// ============================================================================
// <details> nativo: funciona sin JavaScript, con teclado y con lectores de
// pantalla. Respuestas alineadas con lo que el sistema hace hoy.
// ============================================================================

import { Plus } from 'lucide-react'
import { Eyebrow, WHATSAPP_SALES } from './brand'

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: '¿Qué es TakeasyGO, en una frase?',
    a: 'Un solo sistema para tu local gastronómico: carta digital y pedidos online con tu marca, POS para el salón y la caja, inventario, club de clientes y reportes. Todo conectado entre sí.',
  },
  {
    q: '¿El POS es parte del plan o se paga aparte?',
    a: 'El POS TakeasyGO se suma a cualquier plan. Lo activamos junto con vos, porque depende de cómo trabaja tu local: mesas, impresoras, turnos de caja y facturación. Escribinos y lo vemos.',
  },
  {
    q: '¿Qué pasa si se corta internet en pleno servicio?',
    a: 'El POS sigue funcionando: tomás pedidos, cobrás e imprimís igual. Cuando vuelve la conexión, se sincroniza solo. Según el plan, podés tener uno o dos equipos preparados para trabajar sin internet por sede.',
  },
  {
    q: '¿Puedo facturar desde el sistema?',
    a: 'Sí. Emitís factura electrónica ARCA (A, B y C) y notas de crédito, y es compatible con impresora fiscal. Los datos fiscales (certificado, punto de venta, condición ante el IVA) los configura cada comercio.',
  },
  {
    q: '¿Qué necesito para usarlo?',
    a: 'Para vender online, nada más que un celular. Para el POS, la computadora o tablet que ya tenés (Windows o Android) y, si querés comandas y tickets, impresoras térmicas comunes.',
  },
  {
    q: '¿Cómo cobro los pedidos online?',
    a: 'Con Mercado Pago, transferencia o efectivo, según lo que actives. La plata va directo a tu cuenta.',
  },
  {
    q: '¿Puedo probarlo antes de pagar?',
    a: 'Sí. La prueba gratis te deja operar tus primeros 30 pedidos con carta digital, pedidos online y cobro con Mercado Pago. Al llegar a 30, recibís un informe de tu operación y elegís el plan.',
  },
  {
    q: '¿Qué plan me conviene?',
    a: 'Inicial si querés empezar a vender online. Crecimiento si ya tenés movimiento y necesitás inventario, reportes, reservas o varias sedes. Premium si querés analítica avanzada. Élite si además querés el asistente TEO y actualizar precios desde una planilla o una foto de la carta.',
  },
  {
    q: 'Tengo varias sedes o varias marcas, ¿sirve?',
    a: 'Sí, desde el plan Crecimiento. Cada sede tiene su carta, su stock y su caja, y vos ves todo el grupo en una sola pantalla, con un resumen semanal por mail.',
  },
  {
    q: '¿Me ayudan a ponerlo en marcha?',
    a: 'Sí. Podés importar tu carta desde una planilla, y el sistema te guía paso a paso en lo más difícil, como armar el inventario. Además tenés soporte por WhatsApp.',
  },
]

export default function FAQ() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="tgo-faq border-t border-[var(--tgo-line)] bg-white px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Eyebrow>Preguntas frecuentes</Eyebrow>
          <h2 id="faq-title" className="tgo-serif mt-6 text-balance text-[clamp(2rem,4.4vw,3.2rem)] leading-[1.06]">
            Lo que nos preguntan <em className="italic text-[#f14722]">antes de empezar.</em>
          </h2>
          <p className="mt-6 max-w-md text-[1.02rem] leading-relaxed text-[var(--tgo-muted)]">
            ¿No está tu duda? Escribinos por WhatsApp y lo vemos juntos.
          </p>
          <a
            href={WHATSAPP_SALES}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-12 items-center rounded-full border-2 border-[#0d0b0a]/15 px-7 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors hover:border-[#0d0b0a]"
          >
            Preguntar por WhatsApp
          </a>
        </div>

        <div className="divide-y divide-[var(--tgo-line)] border-y border-[var(--tgo-line)]">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex min-h-16 items-center justify-between gap-6 py-5">
                <h3 className="text-[1.05rem] font-bold leading-snug">{f.q}</h3>
                <span className="tgo-faq-icon flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--tgo-cream)] text-[#0d0b0a] group-open:bg-[#f14722] group-open:text-white">
                  <Plus size={17} aria-hidden="true" />
                </span>
              </summary>
              <p className="max-w-2xl pb-6 pr-12 text-[15px] leading-relaxed text-[var(--tgo-muted)]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
