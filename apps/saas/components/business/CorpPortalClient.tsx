'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2, Loader2, CheckCircle, ShieldCheck, Search, Download,
  Trash2, Calendar, Filter, X, ArrowLeft, Users, ClipboardList, BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { privacidad, canalCorporativo } from '@/lib/legal-content'
import { cn } from '@/lib/utils'

interface Props {
  tenant: any
}

type Tab = 'dashboard' | 'history' | 'employees'

interface OrderSummary {
  totalConsumed: number
  totalOrders: number
  totalPending: number
  byEmployee: Record<string, { count: number; total: number }>
  byMode: { individual: { count: number; total: number }; group: { count: number; total: number } }
  periodStart: string | null
  periodEnd: string | null
}

interface OrderItem {
  name: string
  price: number
  quantity: number
  subtotal: number
  addedByEmail: string | null
  selectedVariant: { name: string } | null
}

interface CorpOrder {
  _id: string
  orderNumber: string
  status: string
  createdAt: string
  total: number
  subtotal: number
  paymentModeSnapshot: string | null
  paymentStatus: string
  groupSessionToken: string | null
  items: OrderItem[]
  customer: { name: string; email: string }
}

export default function CorpPortalClient({ tenant }: Props) {
  const [step, setStep] = useState<'verify' | 'portal'>('verify')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [authenticated, setAuthenticated] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [corpOpen, setCorpOpen] = useState(false)
  const [consentPending, setConsentPending] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('corpConsent') !== 'true'
    }
    return true
  })
  const [consentChecked, setConsentChecked] = useState(false)

  // Data states
  const [orders, setOrders] = useState<CorpOrder[]>([])
  const [summary, setSummary] = useState<OrderSummary | null>(null)
  const [employees, setEmployees] = useState<string[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [newEmployeeEmailsCsv, setNewEmployeeEmailsCsv] = useState('')
  const [addingEmployee, setAddingEmployee] = useState(false)

  // Filter states
  const [filterPeriodStart, setFilterPeriodStart] = useState('')
  const [filterPeriodEnd, setFilterPeriodEnd] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('')
  const [filterMode, setFilterMode] = useState('')

  // Check sessionStorage on mount
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('businessEmail')
    const storedRole = sessionStorage.getItem('businessRole')
    const storedAccountId = sessionStorage.getItem('businessCorporateAccountId')

    if (storedEmail && storedRole === 'company_admin' && storedAccountId) {
      setEmail(storedEmail)
      setAuthenticated(true)
      setStep('portal')
    }
  }, [])

  const corporateAccountId = typeof window !== 'undefined'
    ? sessionStorage.getItem('businessCorporateAccountId')
    : null

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams()
    if (corporateAccountId) params.set('corporateAccountId', corporateAccountId)
    if (email) params.set('email', email)
    Object.entries(extra).forEach(([k, v]) => { if (v) params.set(k, v) })
    return params.toString()
  }, [corporateAccountId, email])

  const fetchOrders = useCallback(async () => {
    if (!corporateAccountId || !email) return
    setOrdersLoading(true)
    try {
      const params = buildParams({
        ...(filterPeriodStart && { periodStart: filterPeriodStart }),
        ...(filterPeriodEnd && { periodEnd: filterPeriodEnd }),
        ...(filterEmployee && { employeeEmail: filterEmployee }),
        ...(filterPaymentStatus && { paymentStatus: filterPaymentStatus }),
        ...(filterMode && { mode: filterMode }),
      })
      const res = await fetch(`/api/${tenant.slug}/business/corp/orders?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setOrders(data.orders || [])
    } catch {
      toast.error('Error al cargar órdenes')
    } finally {
      setOrdersLoading(false)
    }
  }, [corporateAccountId, email, tenant.slug, buildParams,
      filterPeriodStart, filterPeriodEnd, filterEmployee, filterPaymentStatus, filterMode])

  const fetchSummary = useCallback(async () => {
    if (!corporateAccountId || !email) return
    setSummaryLoading(true)
    try {
      const params = buildParams({
        ...(filterPeriodStart && { periodStart: filterPeriodStart }),
        ...(filterPeriodEnd && { periodEnd: filterPeriodEnd }),
      })
      const res = await fetch(`/api/${tenant.slug}/business/corp/summary?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSummary(data.summary)
    } catch {
      // silent
    } finally {
      setSummaryLoading(false)
    }
  }, [corporateAccountId, email, tenant.slug, buildParams, filterPeriodStart, filterPeriodEnd])

  const fetchEmployees = useCallback(async () => {
    if (!corporateAccountId || !email) return
    try {
      const params = buildParams()
      const res = await fetch(`/api/${tenant.slug}/business/corp/employees?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEmployees(data.employees || [])
    } catch {
      toast.error('Error al cargar empleados')
    }
  }, [corporateAccountId, email, tenant.slug, buildParams])

  useEffect(() => {
    if (step === 'portal') {
      fetchOrders()
      fetchSummary()
      fetchEmployees()
    }
  }, [step, fetchOrders, fetchSummary, fetchEmployees])

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

      if (data.role !== 'company_admin') {
        toast.error('Este portal es solo para el administrador de la empresa')
        return
      }

      sessionStorage.setItem('businessCorporateAccountId', data.corporateAccountId)
      sessionStorage.setItem('businessCorporateAccountEmail', data.corporateAccountEmail || '')
      sessionStorage.setItem('businessRole', data.role)
      sessionStorage.setItem('businessPaymentMode', data.paymentMode)
      sessionStorage.setItem('businessEmail', email.toLowerCase().trim())

      setAuthenticated(true)
      setStep('portal')
    } catch {
      toast.error('Error al verificar email')
    } finally {
      setLoading(false)
    }
  }

  async function handleExportCsv() {
    if (!corporateAccountId || !email) return
    try {
      const params = buildParams({
        ...(filterPeriodStart && { periodStart: filterPeriodStart }),
        ...(filterPeriodEnd && { periodEnd: filterPeriodEnd }),
      })
      const res = await fetch(`/api/${tenant.slug}/business/corp/orders/export?${params}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conciliacion-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('CSV descargado')
    } catch {
      toast.error('Error al exportar CSV')
    }
  }

  async function handleAddEmployees() {
    const emails = newEmployeeEmailsCsv
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(l => l)
    if (emails.length === 0) return toast.error('Ingresá al menos un email de empleado')
    if (!corporateAccountId) return

    setAddingEmployee(true)
    try {
      const res = await fetch(`/api/${tenant.slug}/business/corp/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corporateAccountId, email, newEmployeeEmails: emails }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al agregar empleados')
        return
      }
      setEmployees(data.employees || [])
      setNewEmployeeEmailsCsv('')
      toast.success(data.message || 'Empleados agregados')
    } catch {
      toast.error('Error al agregar empleados')
    } finally {
      setAddingEmployee(false)
    }
  }

  async function handleRemoveEmployee(empEmail: string) {
    if (!confirm(`¿Eliminar a ${empEmail} de la lista de empleados?`)) return
    try {
      const res = await fetch(`/api/${tenant.slug}/business/corp/employees/${encodeURIComponent(empEmail)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corporateAccountId, email }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Error al eliminar')
        return
      }
      const data = await res.json()
      setEmployees(data.employees || [])
      toast.success('Empleado eliminado')
    } catch {
      toast.error('Error al eliminar empleado')
    }
  }

  // ── Verify email screen ──────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#fafafa]">
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Building2 size={32} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Portal Corporativo</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Ingresá tu email de administrador de empresa para acceder
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@empresa.com"
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
                  <p className="text-[11px] font-semibold text-foreground">Portal Corporativo Seguro</p>
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed mt-0.5">
                    Toda la información viaja cifrada de extremo a extremo. TakeasyGO es promotor activo de la seguridad digital.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setPrivacyOpen(true)}
                  className="text-[11px] text-muted-foreground/50 underline underline-offset-2 hover:text-primary transition-colors"
                >
                  Política de Privacidad
                </button>
                <span className="text-[11px] text-muted-foreground/20">·</span>
                <button
                  type="button"
                  onClick={() => setCorpOpen(true)}
                  className="text-[11px] text-muted-foreground/50 underline underline-offset-2 hover:text-primary transition-colors"
                >
                  Acuerdo Canal Corporativo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy modal */}
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

        {/* Corporate channel modal */}
        <AnimatePresence>
          {corpOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
              onClick={() => setCorpOpen(false)}
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
                  <h2 className="font-bold text-base text-zinc-900">Acuerdo Canal Corporativo</h2>
                  <button
                    onClick={() => setCorpOpen(false)}
                    className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {canalCorporativo.map((section, i) => (
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

  // ── Portal ───────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'history', label: 'Historial', icon: ClipboardList },
    { id: 'employees', label: 'Empleados', icon: Users },
  ]

  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-xl px-4 py-3 outline-none transition-all shadow-sm"
  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-1.5 block"

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">Portal Corporativo</p>
              <p className="text-[10px] text-muted-foreground">{email}</p>
            </div>
          </div>
          <button
            onClick={() => { sessionStorage.clear(); window.location.href = `/${tenant.slug}` }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 py-4 flex gap-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap',
                tab === t.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'bg-white border-2 border-border/60 text-muted-foreground hover:border-primary/40'
              )}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-10 space-y-6">
        {/* ── DASHBOARD TAB ─────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Period filter */}
            <div className="flex flex-wrap items-end gap-3 p-4 bg-card border-2 border-border/60 rounded-2xl">
              <div>
                <label className={labelCls}>Desde</label>
                <input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Hasta</label>
                <input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className={inputCls} />
              </div>
              <button onClick={() => { fetchSummary(); fetchOrders() }} className="px-5 py-3 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/90 transition-all">
                <Calendar size={16} className="inline mr-1" />
                Filtrar
              </button>
              {(filterPeriodStart || filterPeriodEnd) && (
                <button onClick={() => { setFilterPeriodStart(''); setFilterPeriodEnd('') }} className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Limpiar
                </button>
              )}
            </div>

            {/* Summary cards */}
            {summaryLoading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
            ) : summary ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                    <p className="text-2xl font-bold">${summary.totalConsumed.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-1">Total consumido</p>
                  </div>
                  <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                    <p className="text-2xl font-bold">{summary.totalOrders}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-1">Pedidos</p>
                  </div>
                  <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                    <p className="text-2xl font-bold text-amber-600">${summary.totalPending.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-1">Pendiente de pago</p>
                  </div>
                  <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                    <p className="text-2xl font-bold">{Object.keys(summary.byEmployee).length}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-1">Empleados activos</p>
                  </div>
                </div>

                {/* Breakdown by employee */}
                <div className="p-6 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                  <h3 className="font-bold text-sm mb-4">Consumo por empleado</h3>
                  {Object.entries(summary.byEmployee).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin actividad en el período</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(summary.byEmployee)
                        .sort(([, a], [, b]) => b.total - a.total)
                        .map(([empEmail, data]) => (
                          <div key={empEmail} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                            <div>
                              <p className="text-sm font-medium">{empEmail}</p>
                              <p className="text-[10px] text-muted-foreground">{data.count} items</p>
                            </div>
                            <span className="font-bold">${data.total.toLocaleString('es-AR')}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* By mode */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                    <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider mb-1">Individual</p>
                    <p className="text-2xl font-bold">${summary.byMode.individual.total.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] text-muted-foreground">{summary.byMode.individual.count} pedidos</p>
                  </div>
                  <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
                    <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider mb-1">Grupal</p>
                    <p className="text-2xl font-bold">${summary.byMode.group.total.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] text-muted-foreground">{summary.byMode.group.count} pedidos</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Seleccioná un período para ver el resumen</p>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ───────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3 p-4 bg-card border-2 border-border/60 rounded-2xl">
              <div>
                <label className={labelCls}>Desde</label>
                <input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Hasta</label>
                <input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Empleado</label>
                <input type="text" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className={inputCls} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className={labelCls}>Modo</label>
                <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className={inputCls}>
                  <option value="">Todos</option>
                  <option value="individual">Individual</option>
                  <option value="group">Grupal</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Pago</label>
                <select value={filterPaymentStatus} onChange={e => setFilterPaymentStatus(e.target.value)} className={inputCls}>
                  <option value="">Todos</option>
                  <option value="approved">Pagado</option>
                  <option value="pending">Pendiente</option>
                </select>
              </div>
              <button onClick={fetchOrders} className="px-5 py-3 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/90 transition-all">
                <Filter size={16} className="inline mr-1" />
                Buscar
              </button>
              <button onClick={handleExportCsv} className="px-5 py-3 bg-card border-2 border-border/60 font-bold rounded-xl text-sm hover:bg-muted/30 transition-all">
                <Download size={16} className="inline mr-1" />
                Exportar CSV
              </button>
            </div>

            {/* Orders list */}
            {ordersLoading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <ClipboardList size={40} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No hay pedidos en este período</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order._id} className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          #{order.orderNumber.slice(-4)}
                        </div>
                        <div>
                          <p className="text-sm font-bold">#{order.orderNumber}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString('es-AR')} · {new Date(order.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">${order.total.toLocaleString('es-AR')}</p>
                        <p className={cn(
                          'text-[10px] font-bold',
                          order.paymentStatus === 'approved' ? 'text-emerald-600' : 'text-amber-600'
                        )}>
                          {order.paymentStatus === 'approved' ? 'Pagado' : order.paymentStatus === 'pending' ? 'Pendiente' : order.paymentStatus}
                        </p>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-1">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-muted-foreground font-mono">x{item.quantity}</span>
                            <span className="truncate">{item.name}</span>
                            {item.addedByEmail && (
                              <span className="text-muted-foreground/50 text-[9px] truncate">· {item.addedByEmail}</span>
                            )}
                          </div>
                          <span className="font-medium flex-shrink-0">${item.subtotal.toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                      <span className={cn(
                        'text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                        order.groupSessionToken ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {order.groupSessionToken ? 'Grupal' : 'Individual'}
                      </span>
                      <span className={cn(
                        'text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                        order.paymentModeSnapshot === 'deferred' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      )}>
                        {order.paymentModeSnapshot === 'deferred' ? 'Diferido' : order.paymentModeSnapshot === 'cash_mp' ? 'Contado MP' : order.paymentModeSnapshot}
                      </span>
                      <span className={cn(
                        'text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider capitalize',
                        order.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                        order.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
                        'bg-zinc-100 text-zinc-700'
                      )}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EMPLOYEES TAB ──────────────────────────────────────────── */}
        {tab === 'employees' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="p-5 bg-card border-2 border-border/60 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">Empleados habilitados ({employees.length})</h3>
              </div>

              {/* Add employees */}
              <div className="mb-5 space-y-2">
                <textarea
                  value={newEmployeeEmailsCsv}
                  onChange={e => setNewEmployeeEmailsCsv(e.target.value)}
                  placeholder="email1@empresa.com&#10;email2@empresa.com&#10;email3@empresa.com"
                  rows={3}
                  className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-xl px-4 py-3 outline-none transition-all shadow-sm resize-none"
                />
                <button
                  onClick={handleAddEmployees}
                  disabled={addingEmployee || !newEmployeeEmailsCsv.trim()}
                  className="w-full px-5 py-3 bg-primary text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-sm"
                >
                  {addingEmployee ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                  {addingEmployee ? 'Agregando...' : 'Agregar empleados'}
                </button>
              </div>

              {employees.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay empleados registrados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {employees.map(empEmail => (
                    <div key={empEmail} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {empEmail.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-mono">{empEmail}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveEmployee(empEmail)}
                        className="p-2 rounded-xl text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                        title="Eliminar empleado"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Consent overlay for first-time admin */}
        <AnimatePresence>
          {consentPending && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-white flex items-center justify-center p-6"
            >
              <div className="w-full max-w-lg mx-auto">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Building2 size={28} className="text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Acuerdo Canal Corporativo</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Antes de acceder al portal, leé y aceptá el acuerdo de confidencialidad y protección de datos
                  </p>
                </div>

                <div className="bg-muted/30 rounded-2xl p-4 max-h-[45dvh] overflow-y-auto border border-border/60 mb-4 space-y-3">
                  {canalCorporativo.map((section, i) => (
                    <div key={i}>
                      <h3 className="font-bold text-sm text-foreground mb-0.5">{section.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{section.body}</p>
                    </div>
                  ))}
                </div>

                <label className="flex items-start gap-3 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={e => setConsentChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-2 border-border accent-primary"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Acepto el <span className="font-semibold text-foreground">Acuerdo de Confidencialidad y Protección de Datos — Canal Corporativo</span> y reconozco el carácter de co-responsable del tratamiento de datos de mis empleados.
                  </span>
                </label>

                <button
                  onClick={() => {
                    sessionStorage.setItem('corpConsent', 'true')
                    setConsentPending(false)
                    setConsentChecked(false)
                  }}
                  disabled={!consentChecked}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  <CheckCircle size={16} />
                  Aceptar y acceder al portal
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
