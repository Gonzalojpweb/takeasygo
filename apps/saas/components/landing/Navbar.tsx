'use client'

// ============================================================================
// Landing — menú superior
// ============================================================================
// Transparente sobre el hero naranja, blanco con desenfoque al bajar. En el
// celular abre un panel con todas las secciones (antes solo había un botón de
// «Iniciar sesión» y no se podía navegar). Marca la sección que se está viendo.
// ============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo, scrollToId } from './brand'

export const NAV_LINKS = [
  { id: 'plataforma', label: 'Plataforma' },
  { id: 'pos', label: 'POS' },
  { id: 'gestion', label: 'Gestión' },
  { id: 'elite', label: 'Premium y Élite' },
  { id: 'planes', label: 'Planes' },
  { id: 'faq', label: 'Preguntas' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sección visible → enlace marcado.
  useEffect(() => {
    const sections = NAV_LINKS.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => Boolean(el))
    if (sections.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  // Panel del celular: bloquea el scroll de fondo y cierra con Escape.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setOpen(false)
    // Deja cerrar el panel antes de mover la página.
    window.setTimeout(() => scrollToId(id), open ? 60 : 0)
    window.history.replaceState(null, '', `#${id}`)
  }

  const light = !scrolled && !open

  return (
    <>
      <a
        href="#contenido"
        className="tgo-sans fixed left-4 top-4 z-[70] -translate-y-20 rounded-full bg-[#0d0b0a] px-5 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <header
        className={cn(
          'tgo-sans fixed inset-x-0 z-50 transition-all duration-300',
          light ? 'top-5 md:top-6' : 'top-0 border-b border-black/5 bg-white/85 backdrop-blur-xl',
          light && 'tgo-on-orange',
        )}
      >
        <nav aria-label="Principal" className={cn('mx-auto flex max-w-7xl items-center justify-between px-6 md:px-10', light ? 'py-4' : 'py-3')}>
          <Link
            href="/"
            aria-label="TakeasyGO, volver al inicio"
            onClick={(e) => {
              e.preventDefault()
              setOpen(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="rounded-lg"
          >
            <Logo tone={light ? 'onOrange' : 'dark'} size={30} />
          </Link>

          <ul className="hidden items-center gap-7 lg:flex">
            {NAV_LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={go(l.id)}
                  aria-current={active === l.id ? 'true' : undefined}
                  className={cn(
                    'relative py-2 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors',
                    light ? 'text-[#f7f4f1]/90 hover:text-white' : 'text-zinc-500 hover:text-zinc-900',
                    !light && active === l.id && 'text-zinc-900',
                  )}
                >
                  {l.label}
                  {!light && active === l.id && <span aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-[#f14722]" />}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className={cn(
                'hidden min-h-10 items-center rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors sm:inline-flex',
                light ? 'text-[#f7f4f1] hover:bg-white/10' : 'text-zinc-700 hover:bg-zinc-100',
              )}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/empezar"
              className={cn(
                'hidden min-h-10 items-center gap-2 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors sm:inline-flex',
                light ? 'bg-[#0d0b0a] text-[#f7f4f1] hover:bg-[#2a2421]' : 'bg-[#f14722] text-white hover:bg-[#d93a18]',
              )}
            >
              Empezar gratis <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="tgo-mobile-menu"
              aria-label={open ? 'Cerrar el menú' : 'Abrir el menú'}
              className={cn(
                'inline-flex size-11 items-center justify-center rounded-full transition-colors lg:hidden',
                light ? 'bg-[#0d0b0a]/15 text-[#f7f4f1] hover:bg-[#0d0b0a]/25' : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
              )}
            >
              {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Panel del celular */}
      <div
        id="tgo-mobile-menu"
        hidden={!open}
        data-lenis-prevent
        className="tgo-sans fixed inset-0 z-40 overflow-y-auto bg-white px-6 pb-10 pt-24 lg:hidden"
      >
        <ul className="divide-y divide-zinc-100">
          {NAV_LINKS.map((l, i) => (
            <li key={l.id}>
              <a href={`#${l.id}`} onClick={go(l.id)} className="flex min-h-16 items-center justify-between py-3">
                <span className="tgo-serif text-3xl text-[#0d0b0a]">{l.label}</span>
                <span className="text-xs font-semibold tabular-nums text-zinc-400">0{i + 1}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-8 grid gap-3">
          <Link href="/empezar" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f14722] px-6 text-sm font-semibold uppercase tracking-[0.1em] text-white">
            Empezar gratis <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/login" className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-zinc-200 px-6 text-sm font-semibold uppercase tracking-[0.1em] text-zinc-900">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </>
  )
}
