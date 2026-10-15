'use client'

import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PromoModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  tenantName?: string
  tenantLogo?: string
  accentColor?: string
}

export function PromoModal({ open, onClose, children, className, tenantName, tenantLogo, accentColor = '#F74211' }: PromoModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center">
          {/* Backdrop - clicks here close the modal */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.48)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />

          {/* Sheet - clicks here do NOT close the modal */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'relative w-full sm:max-w-lg flex flex-col',
              className
            )}
            style={{
              maxHeight: '92vh',
              borderTopLeftRadius: 'var(--tgo-radius-2xl, 24px)',
              borderTopRightRadius: 'var(--tgo-radius-2xl, 24px)',
              backgroundColor: 'var(--tgo-surface-0, #FFFFFF)',
              boxShadow: 'var(--tgo-elevation-dialog, 0 12px 40px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04))',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: 'var(--tgo-surface-3, #EDEAE6)' }}
              />
            </div>

            {/* Tenant header */}
            {(tenantName || tenantLogo) && (
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2.5">
                  {tenantLogo ? (
                    <div
                      className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${accentColor}10` }}
                    >
                      <img
                        src={tenantLogo}
                        alt={tenantName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : tenantName ? (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                    >
                      {tenantName.charAt(0).toUpperCase()}
                    </div>
                  ) : null}
                  {tenantName && (
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ color: 'var(--tgo-text-primary, #1A1A1A)', fontFamily: 'var(--tgo-type-body-sm)' }}
                    >
                      {tenantName}
                    </span>
                  )}
                </div>

                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                  style={{ color: 'var(--tgo-text-muted, #A09A95)' }}
                  aria-label="Cerrar"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto px-8 pt-6 pb-4"
              style={{ minHeight: 0 }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
