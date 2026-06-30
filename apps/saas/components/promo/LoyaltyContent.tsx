'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { QrPromoData, LoyaltyMessaging } from './types'

interface LoyaltyContentProps {
  promo: QrPromoData
  loyaltyMsg: LoyaltyMessaging | null
  tenantSlug: string
  onClose: () => void
}

const COUNTRY_CODES = [
  { value: '+54', label: '+54' },
  { value: '+1', label: '+1' },
  { value: '+34', label: '+34' },
  { value: '+52', label: '+52' },
]

export function LoyaltyContent({ promo, loyaltyMsg, tenantSlug, onClose }: LoyaltyContentProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', countryCode: '+54' })
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegistering(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: `${form.countryCode} ${form.phone}`,
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

  if (registered) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <div className="size-14 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center">
          <CheckCircle2 size={28} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">
            {loyaltyMsg?.successTitle || '¡Listo!'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {loyaltyMsg?.successMessage || 'Ya sos parte del club.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <p className="text-center text-muted-foreground text-sm">
        {loyaltyMsg?.modalSubtitle || 'Completá tus datos para unirte al club'}
      </p>
      <form onSubmit={handleRegister} className="flex flex-col gap-3">
        <Input
          required
          type="text"
          placeholder="Nombre completo"
          value={form.name}
          onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
        />
        <Input
          required
          type="email"
          placeholder="Correo electrónico"
          value={form.email}
          onChange={e => setForm(s => ({ ...s, email: e.target.value }))}
        />
        <div className="flex gap-2">
          <select
            value={form.countryCode}
            onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
            className="h-10 rounded-xl border-2 border-border/60 bg-muted/40 px-3 text-sm font-medium outline-none focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
          >
            {COUNTRY_CODES.map(cc => (
              <option key={cc.value} value={cc.value}>{cc.label}</option>
            ))}
          </select>
          <Input
            type="tel"
            placeholder="Teléfono"
            value={form.phone}
            onChange={e => setForm(s => ({ ...s, phone: e.target.value }))}
            className="flex-1"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={registering}
          size="lg"
          className="rounded-2xl gap-2 shadow-lg shadow-primary/25 text-base h-12"
        >
          {registering ? (promo.loadingText || 'Registrando...') : 'Unirme al club'}
          {!registering && <ArrowRight size={16} />}
        </Button>
      </form>
    </div>
  )
}
