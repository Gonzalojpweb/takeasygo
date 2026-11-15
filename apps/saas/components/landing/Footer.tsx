'use client'

// ============================================================================
// Landing — pie de página
// ============================================================================
// Incluye el bloque «¿Qué es TakeasyGO?» y «Transparencia sobre datos», que es
// un requisito de la verificación de Google OAuth (sincronización de
// contactos): no quitarlo ni cambiar su sentido.
// ============================================================================

import Link from 'next/link'
import { ArrowUp, Instagram, Mail, MessageCircle, Youtube } from 'lucide-react'
import { Logo, WHATSAPP_SALES, WHATSAPP_SUPPORT, scrollToId } from './brand'
import { NAV_LINKS } from './Navbar'

const linkCls = 'inline-flex min-h-9 items-center gap-2 text-[14.5px] text-zinc-700 transition-colors hover:text-[#f14722]'
const socialCls = 'flex size-11 items-center justify-center rounded-full border border-[var(--tgo-line)] text-zinc-600 transition-colors hover:border-[#0d0b0a] hover:text-[#0d0b0a]'
const headCls = 'text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500'

export default function Footer() {
  return (
    <footer className="tgo-sans">
      {/* Transparencia — requisito de verificación de Google OAuth */}
      <section aria-labelledby="que-es-title" className="border-t border-[var(--tgo-line)] px-6 py-14 md:px-10 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2 md:gap-14">
          <div>
            <h2 id="que-es-title" className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#0d0b0a]">
              ¿Qué es TakeasyGO?
            </h2>
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-[var(--tgo-muted)]">
              TakeasyGO es la plataforma todo en uno para restaurantes: gestioná pedidos, delivery, takeaway, menú digital, punto de venta, club de
              miembros y CRM de clientes desde un solo lugar.
            </p>
          </div>
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#0d0b0a]">Transparencia sobre datos</h3>
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-[var(--tgo-muted)]">
              TakeasyGO accede a tus contactos de Google únicamente para sincronizarlos con el CRM de tu restaurante, de modo que puedas gestionarlos y
              comunicarte con tus clientes. No compartimos tus contactos con terceros.
            </p>
          </div>
        </div>
      </section>

      <div className="border-t border-[var(--tgo-line)] bg-white px-6 py-14 md:px-10 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Logo size={32} />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[var(--tgo-muted)]">Infraestructura digital para la gastronomía. Hecho en Argentina.</p>
            <div className="mt-5 flex gap-2">
              <a href="https://www.instagram.com/takeasygo/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de TakeasyGO" className={socialCls}>
                <Instagram size={18} aria-hidden="true" />
              </a>
              <a href="https://www.youtube.com/watch?v=cJ05n7BUDfc" target="_blank" rel="noopener noreferrer" aria-label="YouTube de TakeasyGO" className={socialCls}>
                <Youtube size={18} aria-hidden="true" />
              </a>
            </div>
          </div>

          <nav aria-label="Secciones">
            <p className={headCls}>Producto</p>
            <ul className="mt-4 space-y-1">
              {NAV_LINKS.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      scrollToId(l.id)
                    }}
                    className={linkCls}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Accesos">
            <p className={headCls}>Accesos</p>
            <ul className="mt-4 space-y-1">
              <li><Link href="/empezar" className={linkCls}>Empezar gratis</Link></li>
              <li><Link href="/login" className={linkCls}>Iniciar sesión</Link></li>
              <li><Link href="/app" className={linkCls}>App para comensales</Link></li>
              <li><Link href="/privacidad" className={linkCls}>Política de privacidad</Link></li>
              <li><Link href="/terminos" className={linkCls}>Términos de servicio</Link></li>
            </ul>
          </nav>

          <div>
            <p className={headCls}>Contacto</p>
            <ul className="mt-4 space-y-1">
              <li>
                <a href="mailto:hola@takeasygo.com" className={linkCls}>
                  <Mail size={15} aria-hidden="true" /> hola@takeasygo.com
                </a>
              </li>
              <li>
                <a href={WHATSAPP_SALES} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  <MessageCircle size={15} aria-hidden="true" /> Hablar con ventas
                </a>
              </li>
              <li>
                <a href={WHATSAPP_SUPPORT} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  <MessageCircle size={15} aria-hidden="true" /> Atención al cliente
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-12 flex max-w-7xl flex-col items-start justify-between gap-4 border-t border-[var(--tgo-line)] pt-6 sm:flex-row sm:items-center">
          <p className="text-[12.5px] text-zinc-500">© 2026 TakeasyGO · Un producto de la consultora Click and Think.</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--tgo-line)] px-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-zinc-700 transition-colors hover:border-[#0d0b0a] hover:text-[#0d0b0a]"
          >
            <ArrowUp size={15} aria-hidden="true" /> Volver arriba
          </button>
        </div>
      </div>
    </footer>
  )
}
