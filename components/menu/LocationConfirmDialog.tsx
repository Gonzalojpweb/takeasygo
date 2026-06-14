'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ShoppingCart, X } from 'lucide-react'

interface Props {
  onConfirm: () => void
  onCancel: () => void
}

export default function LocationConfirmDialog({ onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        key="confirm-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-5"
        style={{
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 360 }}
          className="w-full max-w-[340px]"
          style={{
            background: 'linear-gradient(160deg, #1e1b19 0%, #161310 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 24,
            padding: 28,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: 'rgba(251, 146, 60, 0.1)',
              border: '1px solid rgba(251, 146, 60, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
              boxShadow: '0 0 24px rgba(251,146,60,0.08)',
            }}
          >
            <AlertTriangle size={26} style={{ color: '#fb923c' }} />
          </div>

          {/* Cart illustration */}
          <div
            style={{
              position: 'absolute',
              top: 24,
              right: 28,
              opacity: 0.08,
            }}
          >
            <ShoppingCart size={40} style={{ color: '#f7f4f2' }} />
          </div>

          {/* Text */}
          <h3
            style={{
              fontWeight: 800,
              fontSize: 18,
              color: '#f7f4f2',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: 10,
            }}
          >
            ¿Cambiar de sede?
          </h3>
          <p
            style={{
              fontSize: 13,
              color: '#8a7f7a',
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            Tenés productos en tu carrito. Si cambiás de sede ahora,{' '}
            <span style={{ color: '#f7f4f2', fontWeight: 600 }}>tu pedido se perderá</span>.
          </p>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'rgba(255,255,255,0.06)',
              marginBottom: 20,
            }}
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <motion.button
              onClick={onCancel}
              whileHover={{ background: 'rgba(255,255,255,0.07)' }}
              whileTap={{ scale: 0.97 }}
              style={{
                flex: 1,
                padding: '13px 0',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 13,
                fontWeight: 700,
                color: '#8a7f7a',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Cancelar
            </motion.button>

            <motion.button
              onClick={onConfirm}
              whileHover={{
                background: 'linear-gradient(135deg, #e83d1c 0%, #d13518 100%)',
                boxShadow: '0 4px 20px rgba(241,71,34,0.4)',
              }}
              whileTap={{ scale: 0.97 }}
              style={{
                flex: 1,
                padding: '13px 0',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #f14722 0%, #e03c1a 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(241,71,34,0.3)',
                transition: 'all 0.15s ease',
              }}
            >
              Cambiar igual
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
