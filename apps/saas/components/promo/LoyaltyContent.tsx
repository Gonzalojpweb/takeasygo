'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { QrPromoData, LoyaltyMessaging } from './types'

interface LoyaltyContentProps {
  promo: QrPromoData
  loyaltyMsg: LoyaltyMessaging | null
  tenantSlug: string
  onClose: () => void
  accentColor?: string
}

const COUNTRY_CODES = [
  { value: '+54', label: '+54' },
  { value: '+598', label: '+598' },
  { value: '+56', label: '+56' },
  { value: '+55', label: '+55' },
]

export function LoyaltyContent({ promo, loyaltyMsg, tenantSlug, onClose, accentColor = '#F74211' }: LoyaltyContentProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', countryCode: '+54' })
  const [localName, setLocalName] = useState(form.name)
  const [localEmail, setLocalEmail] = useState(form.email)
  const [localPhone, setLocalPhone] = useState(form.phone)
  const [localCountryCode, setLocalCountryCode] = useState(form.countryCode)
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => nameRef.current?.focus(), 400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    setLocalName(form.name)
    setLocalEmail(form.email)
    setLocalPhone(form.phone)
    setLocalCountryCode(form.countryCode)
  }, [form])

  const isValid =
    localName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(localEmail) &&
    localPhone.replace(/\D/g, '').length >= 8

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || registering) return
    setRegistering(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: localName.trim(),
          email: localEmail.trim(),
          phone: `${localCountryCode} ${localPhone}`,
          source: 'qr_scan',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.code === 'ALREADY_REGISTERED' ? 'Ya estás registrado en el club.' : 'Error al registrarse')
        return
      }
      setRegistered(true)
      setTimeout(() => onClose(), 2500)
    } catch {
      setError('Error de conexión')
    } finally {
      setRegistering(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleRegister(e)
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--tgo-surface-1, #FAFAF8)',
    color: 'var(--tgo-text-primary, #1A1A1A)',
    borderColor: 'var(--tgo-border, #E8E4E0)',
    fontFamily: 'var(--tgo-type-body)',
  }

  if (registered) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <CheckCircle2
            size={72}
            style={{ color: 'var(--tgo-state-success, #12B76A)' }}
            strokeWidth={1.5}
          />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-2xl font-bold mt-6 mb-2"
          style={{ fontFamily: 'var(--tgo-type-section)', color: 'var(--tgo-text-primary, #1A1A1A)' }}
        >
          {loyaltyMsg?.successTitle || '¡Listo!'}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-base"
          style={{ color: 'var(--tgo-text-secondary, #6B6560)', fontFamily: 'var(--tgo-type-body)' }}
        >
          {loyaltyMsg?.successMessage || 'Ya sos parte del club.'}
        </motion.p>
      </div>
    )
  }

  return (
    <div className="flex flex-col py-4">
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-xl font-bold tracking-tight mb-1 text-center"
        style={{ fontFamily: 'var(--tgo-type-section)', color: 'var(--tgo-text-primary, #1A1A1A)' }}
      >
        Completá tus datos
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-sm text-center mb-8"
        style={{ color: 'var(--tgo-text-secondary, #6B6560)', fontFamily: 'var(--tgo-type-body-sm)' }}
      >
        {loyaltyMsg?.modalSubtitle || 'Solo un paso más para empezar a sumar'}
      </motion.p>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        onSubmit={handleRegister}
        className="space-y-4"
      >
        <input
          ref={nameRef}
          type="text"
          placeholder="Nombre completo"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-14 px-5 rounded-2xl text-base font-medium outline-none transition-all duration-150"
          style={{
            ...inputStyle,
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = accentColor }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--tgo-border, #E8E4E0)' }}
        />

        <input
          type="email"
          placeholder="Correo electrónico"
          value={localEmail}
          onChange={(e) => setLocalEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-14 px-5 rounded-2xl text-base font-medium outline-none transition-all duration-150"
          style={{
            ...inputStyle,
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = accentColor }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--tgo-border, #E8E4E0)' }}
        />

        <div className="flex gap-3">
          <select
            value={localCountryCode}
            onChange={(e) => setLocalCountryCode(e.target.value)}
            className="h-14 w-24 px-3 rounded-2xl text-sm font-medium outline-none transition-all duration-150"
            style={{
              ...inputStyle,
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = accentColor }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--tgo-border, #E8E4E0)' }}
          >
            {COUNTRY_CODES.map(cc => (
              <option key={cc.value} value={cc.value}>{cc.label}</option>
            ))}
          </select>

          <input
            type="tel"
            placeholder="Número de WhatsApp"
            value={localPhone}
            onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, ''))}
            onKeyDown={handleKeyDown}
            className="flex-1 h-14 px-5 rounded-2xl text-base font-medium outline-none transition-all duration-150"
            style={{
              ...inputStyle,
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = accentColor }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--tgo-border, #E8E4E0)' }}
          />
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-medium text-center"
            style={{ color: 'var(--tgo-state-danger, #D94A3D)', fontFamily: 'var(--tgo-type-body-sm)' }}
          >
            {error}
          </motion.p>
        )}

        <button
          type="submit"
          disabled={!isValid || registering}
          className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150 disabled:opacity-40 mt-2"
          style={{
            backgroundColor: accentColor,
            color: '#FFFFFF',
            boxShadow: isValid ? `0 12px 24px -4px ${accentColor}66` : 'none',
          }}
        >
          {registering ? (promo.loadingText || 'Procesando...') : 'Unirme al Club'}
          {!registering && <ArrowRight size={16} />}
        </button>
      </motion.form>
    </div>
  )
}
