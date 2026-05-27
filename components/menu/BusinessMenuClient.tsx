'use client'

import { useState } from 'react'
import { Building2, Loader2, CheckCircle, Users, Plus, LogIn, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import MenuPublicView from '@/components/menu/MenuPublicView'

interface Props {
  tenant: any
  location: any
  menu: any
}

export default function BusinessMenuClient({ tenant, location, menu }: Props) {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'verify' | 'mode_select' | 'menu' | 'group_join'>('verify')
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState<string>('')
  const [groupToken, setGroupToken] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)

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
      sessionStorage.setItem('businessCorporateAccountEmail', data.corporateAccountEmail || '')
      sessionStorage.setItem('businessRole', data.role)
      sessionStorage.setItem('businessPaymentMode', data.paymentMode)
      sessionStorage.setItem('businessEmail', email.toLowerCase().trim())

      setRole(data.role)
      setStep('mode_select')
    } catch {
      toast.error('Error al verificar email')
    } finally {
      setLoading(false)
    }
  }

  async function handleStartGroup() {
    const corporateAccountId = sessionStorage.getItem('businessCorporateAccountId')
    if (!corporateAccountId) return toast.error('Error de sesión')

    setCreatingSession(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          locationId: location._id,
          corporateAccountId,
        }),
      })

      const data = await res.json()

      if (res.status === 409) {
        // Session already exists
        toast.error('Ya hay una sesión activa')
        return
      }

      if (!res.ok) {
        toast.error(data.error || 'Error al crear sesión')
        return
      }

      // Copy link and go to session management
      const link = `${window.location.origin}${data.session.shareLink}`
      navigator.clipboard.writeText(link).catch(() => {})
      toast.success('Link copiado al portapapeles')

      // Navigate to session management
      window.location.href = data.session.shareLink
    } catch {
      toast.error('Error al crear sesión grupal')
    } finally {
      setCreatingSession(false)
    }
  }

  async function handleJoinGroup() {
    if (!groupToken.trim()) return toast.error('Ingresá el código de sesión')

    const corporateAccountId = sessionStorage.getItem('businessCorporateAccountId')
    if (!corporateAccountId) return toast.error('Error de sesión')

    const token = groupToken.trim()
    const sessionUrl = `/${tenant.slug}/menu/${location._id}/business/group/${token}`

    // Verify the session exists
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${token}`)
      if (!res.ok) {
        toast.error('Código de sesión inválido')
        return
      }
      window.location.href = sessionUrl
    } catch {
      toast.error('Error al verificar sesión')
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

  if (step === 'mode_select') {
    const isCompanyAdmin = role === 'company_admin'

    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#fafafa' }}>
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold">Menú Business</h1>
            <p className="text-sm text-muted-foreground mt-1">
              ¿Qué querés hacer?
            </p>
          </div>

          {/* Individual order */}
          <button
            onClick={() => setStep('menu')}
            className="w-full p-5 rounded-2xl bg-card border-2 border-border/60 hover:border-primary/40 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <LogIn size={22} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-bold">Pedido individual</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Elegí tus items y pagá al precio corporativo
                </p>
              </div>
            </div>
          </button>

          {/* Group session - only for company admin */}
          {isCompanyAdmin && (
            <button
              onClick={handleStartGroup}
              disabled={creatingSession}
              className="w-full p-5 rounded-2xl bg-card border-2 border-border/60 hover:border-primary/40 text-left transition-all disabled:opacity-60 active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Plus size={22} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold">Iniciar pedido grupal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {creatingSession ? 'Creando sesión...' : 'Creá una sesión para que los empleados agreguen items'}
                  </p>
                </div>
              </div>
            </button>
          )}

          {/* Corp portal - only for company admin */}
          {isCompanyAdmin && (
            <a
              href={`/${tenant.slug}/business/corp`}
              className="block w-full p-5 rounded-2xl bg-card border-2 border-border/60 hover:border-primary/40 text-left transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BarChart3 size={22} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold">Portal Corporativo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Historial de pedidos, conciliaciones y gestión de empleados
                  </p>
                </div>
              </div>
            </a>
          )}

          {/* Join group session - for employees */}
          {!isCompanyAdmin && (
            <div className="p-5 rounded-2xl bg-card border-2 border-border/60 space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users size={22} className="text-primary" />
                </div>
                <div>
                  <p className="font-bold">Unirse a pedido grupal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ingresá el código que te compartió tu empresa
                  </p>
                </div>
              </div>
              <input
                type="text"
                value={groupToken}
                onChange={e => setGroupToken(e.target.value)}
                placeholder="Código de sesión"
                className="w-full border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-primary transition-all"
              />
              <button
                onClick={handleJoinGroup}
                disabled={loading || !groupToken.trim()}
                className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Unirse
              </button>
            </div>
          )}

          {/* Back */}
          <button
            onClick={() => setStep('verify')}
            className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Volver
          </button>
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
