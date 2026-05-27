'use client'

import { useState } from 'react'
import { Building2, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import MenuPublicView from '@/components/menu/MenuPublicView'

interface Props {
  tenant: any
  location: any
  menu: any
}

export default function BusinessMenuClient({ tenant, location, menu }: Props) {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'verify' | 'menu'>('verify')
  const [loading, setLoading] = useState(false)

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return toast.error('Ingresá tu email corporativo')

    setLoading(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Email no registrado')
        return
      }

      const data = await res.json()

      sessionStorage.setItem('businessCorporateAccountId', data.corporateAccountId)
      sessionStorage.setItem('businessRole', data.role)
      sessionStorage.setItem('businessPaymentMode', data.paymentMode)
      sessionStorage.setItem('businessEmail', email.toLowerCase().trim())

      setStep('menu')
    } catch {
      toast.error('Error al verificar email')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#fafafa' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Building2 size={32} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Acceso Business</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ingresá tu email corporativo para acceder al menú con precios especiales
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              className="w-full border-2 border-border rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-all"
              autoFocus
              autoComplete="email"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>

          <p className="text-xs text-center text-muted-foreground/60 mt-6">
            Solo emails registrados por la empresa pueden acceder.
          </p>
        </div>
      </div>
    )
  }

  return (
    <MenuPublicView
      tenant={tenant}
      location={location}
      menu={menu}
      mode="business"
    />
  )
}
