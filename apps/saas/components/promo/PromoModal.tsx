'use client'

import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Hoja de la promo (bottom sheet nativo) ──────────────────────────────────
// Estructura fija: barra de arrastre · cabecera del comercio · contenido con
// scroll · pie fijo con las acciones. Un solo margen lateral (20 px) para
// todo, así nada queda descuadrado ni con posiciones sueltas.

interface PromoModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Acciones fijas al pie (botón principal, secundario, legales). */
  footer?: ReactNode
  className?: string
  tenantName?: string
  tenantLogo?: string
  accentColor?: string
}

export function PromoModal({ open, onClose, children, footer, className, tenantName, tenantLogo, accentColor = '#F74211' }: PromoModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={tenantName ? `Promoción de ${tenantName}` : 'Promoción'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 360 }}
            onClick={(e) => e.stopPropagation()}
            className={cn('relative flex w-full flex-col overflow-hidden rounded-t-[24px] sm:max-w-md sm:rounded-[24px]', className)}
            style={{
              maxHeight: '92dvh',
              backgroundColor: 'var(--tgo-surface-0, #FFFFFF)',
              boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.12)',
            }}
          >
            {/* Barra de arrastre */}
            <div className="flex justify-center pt-2.5">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--tgo-surface-3, #E5E2DE)' }} />
            </div>

            {/* Cabecera del comercio */}
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {tenantLogo ? (
                  <img src={tenantLogo} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" style={{ backgroundColor: `${accentColor}14` }} />
                ) : tenantName ? (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}>
                    {tenantName.charAt(0).toUpperCase()}
                  </div>
                ) : null}
                {tenantName && (
                  <span className="truncate text-sm font-semibold" style={{ color: 'var(--tgo-text-primary, #1A1A1A)' }}>
                    {tenantName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
                style={{ backgroundColor: 'var(--tgo-surface-2, #F3F1EE)', color: 'var(--tgo-text-secondary, #6B6560)' }}
                aria-label="Cerrar"
              >
                <X size={18} strokeWidth={2.25} />
              </button>
            </div>

            {/* Contenido con scroll */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2" data-lenis-prevent>
              {children}
            </div>

            {/* Pie fijo */}
            {footer && (
              <div
                className="px-5 pt-3"
                style={{
                  paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
                  borderTop: '1px solid var(--tgo-border, #EFECE8)',
                  backgroundColor: 'var(--tgo-surface-0, #FFFFFF)',
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
