'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2, Loader2, CheckCircle, Copy, Clock, Users,
  ShoppingBag, Trash2, X, Plus, Minus, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import MenuPublicView from '@/components/menu/MenuPublicView'
import GroupAddConfirmModal from '@/components/menu/GroupAddConfirmModal'

interface Props {
  tenant: any
  location: any
  menu: any
  token: string
  companyAdminEmail: string
  companyName: string
  paymentMode: string
}

interface SessionData {
  token: string
  status: string
  sessionExpiresAt: string
  orderId: string
  companyName: string
  companyAdminEmail: string
  paymentMode: string
  items: any[]
  itemsByEmail: Record<string, any[]>
  total: number
  subtotal: number
  totalEmployees: number
  employeesWithOrders: number
}

export default function GroupSessionClient({
  tenant, location, menu, token,
  companyAdminEmail, companyName, paymentMode,
}: Props) {
  const [step, setStep] = useState<'verify' | 'view'>('verify')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<SessionData | null>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [polling, setPolling] = useState(false)
  const [lastAddData, setLastAddData] = useState<{ itemName: string; items: any[] } | null>(null)

  // Check if already verified (from sessionStorage)
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('businessEmail')
    const storedRole = sessionStorage.getItem('businessRole')
    const storedAccountId = sessionStorage.getItem('businessCorporateAccountId')

    if (storedEmail && storedRole && storedAccountId) {
      setEmail(storedEmail)
      setIsCompanyAdmin(storedRole === 'company_admin')
      loadSession(storedEmail)
      setStep('view')
    }
  }, [])

  const loadSession = useCallback(async (emailToCheck?: string) => {
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${token}`)
      if (!res.ok) {
        toast.error('Sesión no encontrada')
        return
      }
      const data = await res.json()
      setSession(data.session)

      if (emailToCheck) {
        setIsCompanyAdmin(data.session.companyAdminEmail === emailToCheck)
      }
    } catch {
      toast.error('Error al cargar la sesión')
    }
  }, [tenant.slug, token])

  // Poll for admin view (new items added by employees)
  useEffect(() => {
    if (!polling || !isCompanyAdmin) return
    const interval = setInterval(() => loadSession(), 5000)
    return () => clearInterval(interval)
  }, [polling, isCompanyAdmin, loadSession])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return toast.error('Ingresá tu email')

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

      // Verify the verified email's corporate account matches the session
      const sessionRes = await fetch(`/api/${tenant.slug}/business/group-session/${token}`)
      if (!sessionRes.ok) {
        toast.error('Sesión no encontrada')
        return
      }
      const sessionData = await sessionRes.json()

      if (!data.corporateAccountEmail || sessionData.session.companyAdminEmail !== data.corporateAccountEmail) {
        toast.error('Este email no pertenece a la empresa de esta sesión')
        return
      }

      sessionStorage.setItem('businessCorporateAccountId', data.corporateAccountId)
      sessionStorage.setItem('businessCorporateAccountEmail', data.corporateAccountEmail || '')
      sessionStorage.setItem('businessRole', data.role)
      sessionStorage.setItem('businessPaymentMode', data.paymentMode)
      sessionStorage.setItem('businessEmail', email.toLowerCase().trim())

      setIsCompanyAdmin(data.role === 'company_admin')
      setSession(sessionData.session)
      setStep('view')

      if (data.role === 'company_admin') {
        setPolling(true)
      }
    } catch {
      toast.error('Error al verificar email')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    const link = `${window.location.origin}/${tenant.slug}/menu/${location._id}/business/group/${token}`
    navigator.clipboard.writeText(link)
    toast.success('Link copiado al portapapeles')
  }

  async function handleConfirm() {
    if (!confirm('¿Confirmar el pedido grupal? Se enviará al restaurante.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al confirmar')
        return
      }

      // Redirect to tracking page for full order lifecycle visibility
      window.location.href = `/${tenant.slug}/tracking/${data.order.orderNumber}`
    } catch {
      toast.error('Error al confirmar')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!confirm('¿Cancelar la sesión grupal? Todos los items se perderán.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Error al cancelar')
        return
      }
      toast.success('Sesión cancelada')
      loadSession()
      setPolling(false)
    } catch {
      toast.error('Error al cancelar')
    } finally {
      setLoading(false)
    }
  }

  async function handleExtend() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${token}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, extraMinutes: 30 }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Error al extender')
        return
      }
      toast.success('Sesión extendida 30 minutos')
      loadSession()
    } catch {
      toast.error('Error al extender')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveItem(index: number) {
    if (!confirm('¿Eliminar este item?')) return
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${token}/items/${index}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      toast.success('Item eliminado')
      loadSession()
    } catch {
      toast.error('Error al eliminar item')
    }
  }

  function getTimeRemaining(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'Expirada'
    const mins = Math.floor(diff / 60000)
    const secs = Math.floor((diff % 60000) / 1000)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ── Verify email screen ──────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#fafafa' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users size={32} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Pedido Grupal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {companyName} te invitó a un pedido grupal. Ingresá tu email corporativo para participar.
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
              {loading ? 'Verificando...' : 'Unirme al pedido'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const isExpired = session?.status === 'expired'
  const isActive = session?.status === 'active'
  const isConfirmed = session?.status === 'confirmed' || session?.status === 'awaiting_payment'
  const isCancelled = session?.status === 'cancelled'

  // ── Admin view ────────────────────────────────────────────────────────
  if (isCompanyAdmin) {
    const itemsCount = Object.values(session?.itemsByEmail ?? {}).reduce((sum, items) => sum + items.length, 0)

    return (
      <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Building2 size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Pedido Grupal</h1>
          <p className="text-sm text-muted-foreground">{companyName}</p>
        </div>

        {/* Status card */}
        <div className="p-6 bg-card border-2 border-border/60 rounded-[2rem] shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-3 h-3 rounded-full',
                isActive ? 'bg-emerald-500' : isExpired ? 'bg-amber-500' : 'bg-muted-foreground'
              )} />
              <span className="font-bold text-sm capitalize">
                {isActive ? 'Activa' : isExpired ? 'Expirada' : isConfirmed ? 'Confirmada' : 'Cancelada'}
              </span>
            </div>
            {isActive && (
              <div className="flex items-center gap-1 text-sm font-mono tabular-nums text-muted-foreground">
                <Clock size={14} />
                {session?.sessionExpiresAt ? getTimeRemaining(session.sessionExpiresAt) : ''}
              </div>
            )}
          </div>

          {/* Share link */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">
              Compartí este link con tus empleados
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${tenant.slug}/menu/${location._id}/business/group/${token}`}
                className="flex-1 bg-muted/40 border-2 border-border/60 rounded-xl px-4 py-3 text-xs font-mono outline-none"
              />
              <button
                onClick={copyLink}
                className="px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary/90 transition-all"
              >
                <Copy size={16} />
                Copiar
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center">
              <p className="text-2xl font-bold">{itemsCount}</p>
              <p className="text-[10px] uppercase font-bold text-muted-foreground/50">Items</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center">
              <p className="text-2xl font-bold">
                {session?.employeesWithOrders ?? 0}
                <span className="text-base text-muted-foreground">/{session?.totalEmployees ?? 0}</span>
              </p>
              <p className="text-[10px] uppercase font-bold text-muted-foreground/50">Empleados</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center">
              <p className="text-2xl font-bold">${(session?.total ?? 0).toLocaleString('es-AR')}</p>
              <p className="text-[10px] uppercase font-bold text-muted-foreground/50">Total</p>
            </div>
          </div>

          {/* Progreso del grupo */}
          {session && isActive && (
            <div className="space-y-2">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((session.employeesWithOrders / session.totalEmployees) * 100))}%`,
                    backgroundColor: getProgressColor(session.employeesWithOrders, session.totalEmployees),
                  }}
                />
              </div>
              <p
                className="text-xs font-medium"
                style={{ color: getProgressColor(session.employeesWithOrders, session.totalEmployees) }}
              >
                {getProgressText(session.employeesWithOrders, session.totalEmployees)}
              </p>
            </div>
          )}

          {/* Items by employee */}
          {session?.itemsByEmail && Object.entries(session.itemsByEmail).map(([empEmail, empItems]) => (
            <div key={empEmail} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {empEmail.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold">{empEmail}</p>
                  <p className="text-[10px] text-muted-foreground">{empItems.length} items · ${empItems.reduce((s, i) => s + i.subtotal, 0).toLocaleString('es-AR')}</p>
                </div>
              </div>
              <div className="space-y-1.5 pl-10">
                {empItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground">x{item.quantity}</span>
                        <span className="text-sm font-medium truncate">{item.name}</span>
                      </div>
                      {item.selectedVariant && (
                        <p className="text-[10px] text-muted-foreground/60">{item.selectedVariant.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">${item.subtotal.toLocaleString('es-AR')}</span>
                      {isActive && (
                        <button
                          onClick={() => handleRemoveItem(findItemGlobalIndex(session.items, item))}
                          className="p-1 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {itemsCount === 0 && (
            <div className="text-center py-8">
              <ShoppingBag size={32} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Esperando que los empleados agreguen items...</p>
            </div>
          )}
        </div>

        {/* Admin actions */}
        {isActive && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleConfirm}
              disabled={loading || itemsCount === 0}
              className="flex-1 py-4 rounded-2xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {session?.paymentMode === 'deferred' ? '✅ Confirmar pedido' : '💳 Confirmar y pagar'}
            </button>
            <button
              onClick={handleExtend}
              disabled={loading}
              className="px-6 py-4 rounded-2xl bg-card border-2 border-border/60 font-bold text-sm flex items-center gap-2 hover:bg-muted/30 transition-all active:scale-95"
            >
              <Clock size={16} />
              +30 min
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="px-6 py-4 rounded-2xl border-2 border-destructive/20 text-destructive font-bold text-sm flex items-center gap-2 hover:bg-destructive/10 transition-all active:scale-95"
            >
              <X size={16} />
              Cancelar
            </button>
          </div>
        )}

        {isExpired && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
            <AlertTriangle size={20} className="text-amber-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-amber-800">La sesión expiró</p>
            <button
              onClick={handleExtend}
              disabled={loading}
              className="mt-2 px-6 py-2 rounded-xl bg-amber-600 text-white font-bold text-sm"
            >
              Extender 30 minutos
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Participant view (employee) ───────────────────────────────────────
  const itemCount = session?.items?.filter((i: any) => i.addedByEmail === email).length ?? 0
  const myTotal = session?.items?.filter((i: any) => i.addedByEmail === email).reduce((s: number, i: any) => s + i.subtotal, 0) ?? 0

  if (session?.status === 'confirmed' || session?.status === 'awaiting_payment' || session?.status?.startsWith('awaiting') || session?.status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            {session.status === 'cancelled' ? <X size={28} className="text-destructive" /> : <CheckCircle size={28} className="text-emerald-500" />}
          </div>
          <h2 className="text-xl font-bold mb-2">
            {session.status === 'cancelled' ? 'Sesión cancelada' : 'Pedido confirmado'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {session.status === 'cancelled'
              ? 'El administrador canceló esta sesión grupal.'
              : 'El pedido grupal fue enviado al restaurante.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Barra superior con info del grupo */}
      <div className="sticky top-0 z-40 bg-white border-b border-border/60">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-xs font-bold">{companyName}</p>
              <p className="text-[10px] text-muted-foreground">
                {itemCount} items · ${myTotal.toLocaleString('es-AR')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session?.sessionExpiresAt && (
              <span className="text-xs font-mono tabular-nums text-muted-foreground flex items-center gap-1">
                <Clock size={12} />
                {getTimeRemaining(session.sessionExpiresAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Menu */}
      <MenuPublicView
        tenant={tenant}
        location={location}
        menu={menu}
        mode="business"
        groupSessionToken={token}
        groupEmail={email}
        onGroupItemAdded={(name, updatedItems) => setLastAddData({ itemName: name, items: updatedItems })}
      />

      <GroupAddConfirmModal
        open={!!lastAddData}
        onOpenChange={(open) => { if (!open) setLastAddData(null) }}
        itemName={lastAddData?.itemName || ''}
        myItemsCount={lastAddData ? lastAddData.items.filter((i: any) => i.addedByEmail === email).length : 0}
        myTotal={lastAddData ? lastAddData.items.filter((i: any) => i.addedByEmail === email).reduce((s: number, i: any) => s + i.subtotal, 0) : 0}
        sessionExpiresAt={session?.sessionExpiresAt}
        onClose={() => setLastAddData(null)}
      />
    </div>
  )
}

function getProgressColor(completed: number, total: number): string {
  const pct = total > 0 ? completed / total : 0
  if (pct >= 1) return '#22c55e'
  if (pct >= 0.9) return '#22c55e'
  if (pct >= 0.5) return '#f59e0b'
  return '#ef4444'
}

function getProgressText(completed: number, total: number): string {
  const remaining = total - completed
  if (completed === 0) return 'Nadie pidió aún'
  if (remaining === 0) return '¡Todos pidieron! Ya podés confirmar.'
  if (remaining === 1) return 'Falta 1 empleado'
  return `Faltan ${remaining} empleados`
}

function findItemGlobalIndex(items: any[], targetItem: any): number {
  return items.findIndex(i => i === targetItem)
}
