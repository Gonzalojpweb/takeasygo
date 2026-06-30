'use client'

import { useState, useEffect } from 'react'
import { Building2, Loader2, CheckCircle, ShieldCheck, X, Users, Plus, LogIn, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { privacidad } from '@/lib/legal-content'
import MenuPublicView from '@/components/menu/MenuPublicView'
import BusinessGuideSheet from '@/components/business/BusinessGuideSheet'

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
  const [guideOpen, setGuideOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('businessEmail')
    const storedRole = sessionStorage.getItem('businessRole')
    const storedAccountId = sessionStorage.getItem('businessCorporateAccountId')

    if (storedEmail && storedRole && storedAccountId) {
      setEmail(storedEmail)
      setRole(storedRole)
      setStep('mode_select')
    }
  }, [])

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
        // Session already exists — re-enter it
        const sessionUrl = `/${tenant.slug}/menu/${location._id}/business/group/${data.token}`
        window.location.href = sessionUrl
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
      <>
        <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ backgroundColor: '#fafafa' }}>
          {/* Guide trigger */}
          <button
            onClick={() => setGuideOpen(true)}
            className="absolute top-3 right-3 text-xs text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-muted-foreground/10 flex items-center justify-center text-[10px] font-bold leading-none">?</span>
            ¿Cómo funciona?
          </button>
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

            <div className="mt-6 pt-5 border-t border-border/40">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">Tus datos están protegidos</p>
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed mt-0.5">
                    Toda la información viaja cifrada de extremo a extremo con protocolos de seguridad avanzados. TakeasyGO es promotor activo de la seguridad digital.
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-3 text-center">
                Al continuar, aceptás nuestra{' '}
                <button
                  type="button"
                  onClick={() => setPrivacyOpen(true)}
                  className="underline underline-offset-2 hover:text-primary transition-colors"
                >
                  Política de Privacidad
                </button>
              </p>
            </div>

            <p className="text-xs text-center text-muted-foreground/60 mt-4">
              Solo emails registrados por la empresa pueden acceder.
            </p>
          </div>
        </div>
        <BusinessGuideSheet open={guideOpen} onOpenChange={setGuideOpen} tenantName={tenant.name} />

        <AnimatePresence>
          {privacyOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
              onClick={() => setPrivacyOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 30 }}
                transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                className="w-full max-w-md bg-white rounded-3xl max-h-[80dvh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-zinc-100 p-4 flex items-center justify-between rounded-t-3xl z-10">
                  <h2 className="font-bold text-base text-zinc-900">Política de Privacidad</h2>
                  <button
                    onClick={() => setPrivacyOpen(false)}
                    className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {privacidad.map((section, i) => (
                    <div key={i}>
                      <h3 className="font-bold text-sm text-zinc-900 mb-1">{section.title}</h3>
                      <p className="text-sm text-zinc-500 leading-relaxed">{section.body}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  if (step === 'mode_select') {
    const isCompanyAdmin = role === 'company_admin'

    return (
      <>
        <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ backgroundColor: '#fafafa' }}>
          {/* Guide trigger */}
          <button
            onClick={() => setGuideOpen(true)}
            className="absolute top-3 right-3 text-xs text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-muted-foreground/10 flex items-center justify-center text-[10px] font-bold leading-none">?</span>
            ¿Cómo funciona?
          </button>
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
        <BusinessGuideSheet open={guideOpen} onOpenChange={setGuideOpen} tenantName={tenant.name} />
      </>
    )
  }

  return (
    <>
      <MenuPublicView
        tenant={tenant}
        location={location}
        menu={menu}
        mode="business"
      />
      <BusinessGuideSheet open={guideOpen} onOpenChange={setGuideOpen} tenantName={tenant.name} />
    </>
  )
}
