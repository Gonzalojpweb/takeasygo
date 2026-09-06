'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import PuntoTGO from '@/components/tgo/PuntoTGO'

interface AuthStageProps {
  userName: string
  onComplete: () => void
  onPersistData: () => void
}

export default function AuthStage({ userName, onComplete, onPersistData }: AuthStageProps) {
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showEmailInput && !emailSent) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(timer)
    }
  }, [showEmailInput, emailSent])

  const handleGoogle = async () => {
    onPersistData()
    const { signIn } = await import('next-auth/react')
    await signIn('google', { callbackUrl: '/app' })
  }

  const handleEmailSubmit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresá un email válido')
      return
    }
    setError('')
    setSending(true)
    onPersistData()
    try {
      const { signIn } = await import('next-auth/react')
      const result = await signIn('email', {
        email: email.trim(),
        callbackUrl: '/app',
        redirect: false,
      })
      if (result?.error) {
        setError('Error al enviar. Intentá de nuevo.')
        setSending(false)
      } else {
        // Email sent successfully — show confirmation screen
        setSentEmail(email.trim())
        setEmailSent(true)
        setSending(false)
      }
    } catch {
      setError('Error al enviar. Intentá de nuevo.')
      setSending(false)
    }
  }

  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && email.trim() && !sending) {
      handleEmailSubmit()
    }
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
      <AnimatePresence mode="wait">
        {!showEmailInput ? (
          /* ── Main auth screen ─────────────────────────────── */
          <motion.div
            key="auth-main"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center w-full"
          >
            {/* PuntoTGO Pin */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, duration: 0.5, type: 'spring', bounce: 0.4 }}
              className="mb-8"
            >
              <PuntoTGO expression="happy" size="xl" animate={false} />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-2xl font-bold tracking-tight mb-3 text-center"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              Tu perfil gastronómico
            </motion.h2>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-sm text-center mb-10 leading-relaxed max-w-[280px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              Iniciá sesión para guardar tus favoritos, seguir tus pedidos y ver tu nivel en cada local de la red.
            </motion.p>

            {/* Auth buttons */}
            <div className="flex flex-col gap-3 w-full max-w-[300px]">
              {/* Google */}
              <motion.button
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleGoogle}
                className="h-14 rounded-2xl flex items-center justify-center gap-3 font-semibold text-sm transition-all duration-150"
                style={{
                  backgroundColor: 'var(--tgo-text-on-accent)',
                  color: 'var(--tgo-surface-1)',
                  border: '1px solid var(--tgo-border)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar con Google
              </motion.button>

              {/* Apple - disabled */}
              <motion.button
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                disabled
                className="h-14 rounded-2xl flex items-center justify-center gap-3 font-semibold text-sm transition-all duration-150 opacity-50 cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--tgo-surface-1)',
                  color: 'var(--tgo-text-muted)',
                  border: '1px solid var(--tgo-border)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Apple — próximamente
              </motion.button>

              {/* Email — text link */}
              <motion.button
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowEmailInput(true)}
                className="h-14 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm transition-all duration-150"
                style={{
                  color: 'var(--tgo-text-primary)',
                }}
              >
                Continuar con email
              </motion.button>
            </div>
          </motion.div>
        ) : emailSent ? (
          /* ── Email sent confirmation ─────────────────────── */
          <motion.div
            key="email-sent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center w-full"
          >
            {/* Check icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5, type: 'spring', bounce: 0.4 }}
              className="mb-8"
            >
              <CheckCircle2 size={64} color="#12B76A" strokeWidth={1.5} />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-2xl font-bold tracking-tight mb-3 text-center"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              Revisá tu email.
            </motion.h2>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-sm text-center mb-3 leading-relaxed max-w-[280px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              Te enviamos un link mágico para entrar sin contraseña.
            </motion.p>

            {/* Sent to */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-sm font-medium text-center mb-10"
              style={{ color: 'var(--tgo-brand-primary)' }}
            >
              {sentEmail}
            </motion.p>

            {/* Instructions */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="w-full max-w-[300px] p-4 rounded-2xl mb-8"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--tgo-text-muted)' }}>
                Abrí el email en tu celular o computadora y hacé clic en el link. Vas a volver automáticamente a la app.
              </p>
            </motion.div>

            {/* Back to try again */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setEmailSent(false)
                setShowEmailInput(false)
                setEmail('')
                setSentEmail('')
              }}
              className="flex items-center gap-1 text-sm font-medium"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              <ArrowLeft size={14} />
              Usar otro email
            </motion.button>
          </motion.div>
        ) : (
          /* ── Email input screen ──────────────────────────── */
          <motion.div
            key="email-input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center w-full"
          >
            {/* Back button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              onClick={() => {
                setShowEmailInput(false)
                setEmail('')
                setError('')
              }}
              className="self-start mb-8 flex items-center gap-1 text-sm font-medium"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              <ArrowLeft size={14} />
              Atrás
            </motion.button>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="text-2xl font-bold tracking-tight mb-2 text-center"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              Ingresá tu email
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="text-sm text-center mb-8"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              Te enviamos un link mágico para acceder sin contraseña.
            </motion.p>

            {/* Email input */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="w-full max-w-[300px] mb-4"
            >
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                onKeyDown={handleEmailKeyDown}
                placeholder="tu@email.com"
                autoComplete="email"
                className="w-full h-14 rounded-2xl px-5 text-base font-medium outline-none transition-all duration-150"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: 'var(--tgo-text-primary)',
                  border: error
                    ? '1px solid var(--tgo-state-danger)'
                    : '1px solid rgba(255,255,255,0.1)',
                }}
                onFocus={(e) => {
                  if (!error) e.currentTarget.style.borderColor = 'var(--tgo-brand-primary)'
                }}
                onBlur={(e) => {
                  if (!error) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }}
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs mt-2 ml-1"
                  style={{ color: 'var(--tgo-state-danger)' }}
                >
                  {error}
                </motion.p>
              )}
            </motion.div>

            {/* Send button */}
            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleEmailSubmit}
              disabled={!email.trim() || sending}
              className="w-full max-w-[300px] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150 disabled:opacity-30"
              style={{
                backgroundColor: 'var(--tgo-brand-primary)',
                color: 'var(--tgo-text-on-accent)',
                boxShadow: email.trim() ? '0 12px 24px -4px rgba(247, 66, 17, 0.4)' : 'none',
              }}
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Enviar link
                  <ChevronRight size={14} />
                </>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
