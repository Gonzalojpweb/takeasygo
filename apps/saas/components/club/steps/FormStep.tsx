'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { ClubFormData } from '../types'

interface FormStepProps {
  formData: ClubFormData
  accentColor: string
  ctaText?: string
  error?: string
  registering?: boolean
  onChange: (data: Partial<ClubFormData>) => void
  onSubmit: () => void
}

export default function FormStep({
  formData,
  accentColor,
  ctaText,
  error,
  registering = false,
  onChange,
  onSubmit,
}: FormStepProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [localName, setLocalName] = useState(formData.name)
  const [localEmail, setLocalEmail] = useState(formData.email)
  const [localPhone, setLocalPhone] = useState(formData.phone)
  const [localCountryCode, setLocalCountryCode] = useState(formData.countryCode)

  useEffect(() => {
    const timer = setTimeout(() => nameRef.current?.focus(), 400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    setLocalName(formData.name)
    setLocalEmail(formData.email)
    setLocalPhone(formData.phone)
    setLocalCountryCode(formData.countryCode)
  }, [formData])

  const isValid =
    localName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(localEmail) &&
    localPhone.replace(/\D/g, '').length >= 8

  const handleSubmit = () => {
    if (!isValid || registering) return
    onChange({
      name: localName.trim(),
      email: localEmail.trim(),
      phone: localPhone,
      countryCode: localCountryCode,
    })
    onSubmit()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleSubmit()
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--tgo-surface-1, #FAFAF8)',
    color: 'var(--tgo-text-primary, #1A1A1A)',
    borderColor: 'var(--tgo-border, #E8E4E0)',
    fontFamily: 'var(--tgo-type-body)',
  }

  const focusBorderColor = accentColor

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
        Solo un paso más para empezar a sumar
      </motion.p>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
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
          onFocus={(e) => { e.currentTarget.style.borderColor = focusBorderColor }}
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
          onFocus={(e) => { e.currentTarget.style.borderColor = focusBorderColor }}
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
          >
            <option value="+54">🇦🇷 +54</option>
            <option value="+598">🇺🇾 +598</option>
            <option value="+56">🇨🇱 +56</option>
            <option value="+55">🇧🇷 +55</option>
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
            onFocus={(e) => { e.currentTarget.style.borderColor = focusBorderColor }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--tgo-border, #E8E4E0)' }}
          />
        </div>

        {error && (
          <p className="text-sm font-medium text-center" style={{ color: 'var(--tgo-state-danger, #D94A3D)' }}>
            {error}
          </p>
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
          {registering ? 'Procesando...' : ctaText || 'Unirme al Club'}
          {!registering && <ArrowRight size={16} />}
        </button>
      </motion.form>
    </div>
  )
}
