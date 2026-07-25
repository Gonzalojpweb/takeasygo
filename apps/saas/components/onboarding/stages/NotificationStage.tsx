'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, ChevronRight } from 'lucide-react'

interface NotificationStageProps {
  onComplete: (permission: 'granted' | 'denied') => void
}

const benefits = [
  'Tu pedido está listo.',
  'Promociones exclusivas.',
  'Beneficios de los clubes gastronómicos.',
  'Eventos cerca tuyo.',
  'Novedades de tus lugares favoritos.',
]

export default function NotificationStage({ onComplete }: NotificationStageProps) {
  const [requesting, setRequesting] = useState(false)

  const handleActivate = async () => {
    setRequesting(true)
    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission()
        onComplete(permission === 'granted' ? 'granted' : 'denied')
      } else {
        onComplete('denied')
      }
    } catch {
      onComplete('denied')
    }
  }

  const handleSkip = () => {
    onComplete('denied')
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Bell icon */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, duration: 0.5, type: 'spring', bounce: 0.4 }}
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
        style={{ backgroundColor: 'rgba(247, 66, 17, 0.1)' }}
      >
        <Bell size={28} color="var(--tgo-brand-primary)" />
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="text-2xl font-bold tracking-tight mb-3 text-center"
        style={{ color: 'var(--tgo-text-primary)' }}
      >
        No te pierdas lo mejor.
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="text-sm text-center mb-8"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        Activá las notificaciones para recibir:
      </motion.p>

      {/* Benefits list */}
      <div className="flex flex-col gap-3 mb-10 w-full max-w-[280px]">
        {benefits.map((benefit, i) => (
          <motion.div
            key={benefit}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: 0.45 + i * 0.1,
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="flex items-center gap-3"
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(22, 163, 74, 0.15)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-sm" style={{ color: 'var(--tgo-text-primary)' }}>
              {benefit}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-[300px]">
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleActivate}
          disabled={requesting}
          className="h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--tgo-brand-primary)',
            color: 'var(--tgo-surface-card)',
            boxShadow: '0 12px 24px -4px rgba(247, 66, 17, 0.4)',
          }}
        >
          {requesting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Activar notificaciones
              <Bell size={14} />
            </>
          )}
        </motion.button>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSkip}
          className="h-12 rounded-2xl flex items-center justify-center font-medium text-sm transition-all duration-150"
          style={{
            color: 'var(--tgo-text-muted)',
          }}
        >
          Ahora no
        </motion.button>
      </div>
    </motion.div>
  )
}
