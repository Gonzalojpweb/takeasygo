'use client'

// ============================================================================
// Landing — piezas de marca compartidas
// ============================================================================
// Logo en SVG (el archivo de imagen anterior quedó inaccesible), etiqueta
// superior, titular serif con frase en itálica, aparición al hacer scroll y
// botones. Colores y tipografías: ver landing.css.
// ============================================================================

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export const ORANGE = '#f14722'
export const INK = '#0d0b0a'
export const CREAM = '#f7f4f1'

export const WHATSAPP_SALES = 'https://wa.me/5491138795976'
export const WHATSAPP_SUPPORT = 'https://wa.me/5491160019734'

/** Isotipo: anillo abierto, pin y punto (el del ícono de la app). */
export function LogoMark({ size = 32, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' | 'onOrange' }) {
  const main = tone === 'dark' ? INK : CREAM
  const dot = tone === 'onOrange' ? INK : ORANGE
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M33.5 7.6A19 19 0 1 0 43 24" stroke={main} strokeWidth="4.4" strokeLinecap="round" />
      <path
        d="M24 14.5c-4.3 0-7.6 3.2-7.6 7.3 0 5.2 5.6 10.3 7 11.5.35.3.85.3 1.2 0 1.4-1.2 7-6.3 7-11.5 0-4.1-3.3-7.3-7.6-7.3Zm0 10.3a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
        fill={main}
      />
      <circle cx="40.2" cy="12.6" r="4.1" fill={dot} />
    </svg>
  )
}

export function Logo({ tone = 'dark', size = 30, className }: { tone?: 'dark' | 'light' | 'onOrange'; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} tone={tone} />
      <span
        className="tgo-sans font-bold tracking-tight"
        style={{ fontSize: size * 0.66, color: tone === 'dark' ? INK : CREAM, letterSpacing: '-0.03em' }}
      >
        Takeasy<span style={{ color: tone === 'onOrange' ? INK : ORANGE }}>GO</span>
      </span>
    </span>
  )
}

export function Eyebrow({ children, tone = 'orange', center }: { children: React.ReactNode; tone?: 'orange' | 'cream' | 'ink'; center?: boolean }) {
  const color = tone === 'orange' ? ORANGE : tone === 'cream' ? 'rgba(247,244,241,0.95)' : INK
  return (
    <p className={cn('flex items-center gap-3 text-[11px] font-semibold uppercase', center && 'justify-center')} style={{ color, letterSpacing: '0.22em' }}>
      <span aria-hidden="true" className="block h-px w-8 shrink-0" style={{ background: color }} />
      {children}
      {center && <span aria-hidden="true" className="block h-px w-8 shrink-0" style={{ background: color }} />}
    </p>
  )
}

/** Titular de sección: serif, con la segunda frase en itálica y color de acento. */
export function SectionTitle({
  as: Tag = 'h2',
  id,
  lead,
  accent,
  tone = 'ink',
  className,
}: {
  as?: 'h1' | 'h2' | 'h3'
  id?: string
  lead: string
  accent: string
  tone?: 'ink' | 'cream'
  className?: string
}) {
  return (
    <Tag id={id} className={cn('tgo-serif text-balance', className)} style={{ color: tone === 'ink' ? INK : CREAM, lineHeight: 1.06 }}>
      {lead}{' '}
      <em style={{ color: ORANGE, fontStyle: 'italic' }}>{accent}</em>
    </Tag>
  )
}

/** Aparición suave al entrar en pantalla (sin movimiento si el usuario lo pide). */
export function Reveal({ children, delay = 0, className, y = 22 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -70px 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  // El foco acompaña al salto (teclado y lectores de pantalla).
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

const btnBase =
  'inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full px-7 text-[12px] font-semibold uppercase transition-all duration-200 active:scale-[0.98] cursor-pointer whitespace-nowrap'

export const btn = {
  /** Fondo tinta: acción principal sobre naranja o crema. */
  ink: cn(btnBase, 'bg-[#0d0b0a] text-[#f7f4f1] hover:bg-[#2a2421] shadow-[0_6px_20px_rgba(13,11,10,0.18)] tracking-[0.08em]'),
  /** Fondo naranja: acción principal sobre claro u oscuro. */
  orange: cn(btnBase, 'bg-[#f14722] text-white hover:bg-[#d93a18] shadow-[0_8px_24px_rgba(241,71,34,0.28)] tracking-[0.08em]'),
  /** Borde: acción secundaria sobre claro. */
  outline: cn(btnBase, 'border-2 border-[#0d0b0a]/15 text-[#0d0b0a] hover:border-[#0d0b0a] bg-transparent tracking-[0.08em]'),
  /** Borde claro: acción secundaria sobre naranja u oscuro. */
  ghostLight: cn(btnBase, 'border-2 border-[#f7f4f1]/40 text-[#f7f4f1] hover:bg-[#f7f4f1]/10 hover:border-[#f7f4f1]/70 tracking-[0.08em]'),
}

export function PrimaryLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(btn.orange, className)}>
      {children}
    </Link>
  )
}
