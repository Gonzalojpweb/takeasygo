'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2, Store, Globe, CreditCard, ShieldAlert, ArrowLeft, Loader2, Save, AlertTriangle, Mail, Pencil, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PLAN_LABELS, PLAN_TAGLINES, PLAN_PRICE } from '@/lib/plans'
import type { Plan } from '@/lib/plans'

const PLAN_FEATURES_SHORT: Record<Plan, string[]> = {
  trial: ['Menú + pedidos takeaway', 'Panel básico de órdenes', 'Hasta 30 pedidos → Informe ICO gratis'],
  try:   ['Menú + pedidos + MercadoPago', 'Impresión automática en cocina', '1 sede / 1 impresora'],
  buy:   ['Todo Inicial incluido', 'Reportes, múltiples sedes y usuarios', 'ICO — Fiabilidad Operativa'],
  full:  ['Todo Crecimiento incluido', 'Analytics avanzados + TPP + horarios', 'ICO diagnóstico completo'],
}

interface Props {
  tenant: any
  adminEmail: string | null
}

export default function EditTenantForm({ tenant, adminEmail: initialAdminEmail }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Admin email state
  const [adminEmail, setAdminEmail]       = useState(initialAdminEmail ?? '')
  const [editingEmail, setEditingEmail]   = useState(false)
  const [newEmail, setNewEmail]           = useState('')
  const [emailLoading, setEmailLoading]   = useState(false)
  const [emailError, setEmailError]       = useState<string | null>(null)

  async function handleSaveEmail() {
    if (!newEmail || newEmail === adminEmail) { setEditingEmail(false); return }
    setEmailError(null)
    setEmailLoading(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant._id}/admin-email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar')
      setAdminEmail(data.email)
      setEditingEmail(false)
      toast.success('Email del admin actualizado')
    } catch (err: any) {
      setEmailError(err.message)
    } finally {
      setEmailLoading(false)
    }
  }
  const [form, setForm] = useState({
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    isActive: tenant.isActive,
    featuresReservations: tenant.features?.reservations ?? false,
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          plan: form.plan,
          isActive: form.isActive,
          features: { reservations: form.featuresReservations },
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Tenant actualizado correctamente')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch {
      toast.error('Error al actualizar el tenant')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar permanentemente el tenant "${tenant.name}"?\nEsta acción no se puede deshacer.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Tenant eliminado del sistema')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch {
      toast.error('Error al eliminar el tenant')
    } finally {
      setDeleting(false)
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="bg-card border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Store size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Datos del Restaurante</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Información principal y plan de suscripción</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Nombre + Slug */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className={labelCls}>Nombre del Restaurante</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                    <Store size={18} />
                  </div>
                  <input required value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className={cn(inputCls, "pl-12")} />
                </div>
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Identificador (Slug / URL)</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                    <Globe size={18} />
                  </div>
                  <input required value={form.slug}
                    onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                    className={cn(inputCls, "pl-12 font-mono")} />
                </div>
              </div>
            </div>

            {/* Plan de Servicio — ancho completo */}
            <div className="space-y-2">
              <label className={labelCls}>Plan de Servicio</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(['trial', 'try', 'buy', 'full'] as Plan[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, plan: p }))}
                    className={cn(
                      'text-left p-5 rounded-2xl border-2 transition-all',
                      form.plan === p
                        ? 'border-primary bg-primary/10'
                        : 'border-border/60 hover:border-primary/40'
                    )}
                  >
                    <p className={cn('font-bold text-sm', form.plan === p ? 'text-primary' : 'text-foreground')}>{PLAN_LABELS[p]}</p>
                    {p === 'trial' ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500">Prueba gratuita</span>
                    ) : (
                      <p className="text-muted-foreground text-[10px] font-bold mt-0.5">{PLAN_PRICE[p]}</p>
                    )}
                    <ul className="mt-3 space-y-1.5">
                      {PLAN_FEATURES_SHORT[p].map((f, i) => (
                        <li key={i} className="text-muted-foreground text-xs flex items-start gap-1.5">
                          <span className="text-primary mt-0.5 shrink-0">·</span> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              {(() => {
                const planOrder: Plan[] = ['trial', 'try', 'buy', 'full']
                const origIdx = planOrder.indexOf(tenant.plan as Plan)
                const newIdx  = planOrder.indexOf(form.plan as Plan)
                if (tenant.plan === 'trial' && newIdx > origIdx) {
                  return (
                    <div className="flex items-start gap-2 mt-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-xs text-primary">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>Activar plan <strong>{PLAN_LABELS[form.plan as Plan]}</strong> — El restaurante tendrá acceso completo a las funciones del plan seleccionado.</span>
                    </div>
                  )
                }
                if (newIdx < origIdx) {
                  const disabled = planOrder.slice(newIdx + 1, origIdx + 1).map(p => PLAN_LABELS[p]).join(', ')
                  return (
                    <div className="flex items-start gap-2 mt-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-600">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>Cambiar de <strong>{PLAN_LABELS[tenant.plan as Plan]}</strong> a <strong>{PLAN_LABELS[form.plan as Plan]}</strong> deshabilitará funciones de: {disabled} para este restaurante.</span>
                    </div>
                  )
                }
                return null
              })()}
            </div>

            {/* Estado del tenant + Features */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", form.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-destructive")} />
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Estado del Tenant</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center",
                    form.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                    form.isActive ? 'left-[26px]' : 'left-1'
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", form.featuresReservations ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-muted-foreground/30")} />
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Módulo Reservaciones</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, featuresReservations: !p.featuresReservations }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center",
                    form.featuresReservations ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                    form.featuresReservations ? 'left-[26px]' : 'left-1'
                  )} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-8 border-t border-border/40">
              <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <><Save size={18} className="mr-2" /> Guardar Cambios</>}
              </Button>
              <Button type="button" variant="ghost" className="text-muted-foreground font-bold px-8 h-14 rounded-2xl" onClick={() => router.back()}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Admin del tenant */}
      <Card className="bg-card border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Mail size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Admin del restaurante</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Email de acceso al panel de administración</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          {!editingEmail ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase font-black tracking-widest text-muted-foreground/50 mb-1">Email actual</p>
                <p className="text-sm font-mono font-medium text-foreground">
                  {adminEmail || <span className="text-muted-foreground italic">Sin admin asignado</span>}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl gap-2 font-bold text-xs"
                onClick={() => { setNewEmail(adminEmail); setEditingEmail(true); setEmailError(null) }}
              >
                <Pencil size={13} /> Editar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="nuevo@email.com"
                  autoFocus
                  className="flex-1 bg-muted/40 border-2 border-border/60 focus:border-primary/40 text-foreground text-sm font-mono rounded-2xl px-4 py-3 outline-none transition-all"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={emailLoading}
                  onClick={handleSaveEmail}
                  className="rounded-xl gap-2 font-bold text-xs bg-primary text-white"
                >
                  {emailLoading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Guardar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={emailLoading}
                  onClick={() => { setEditingEmail(false); setEmailError(null) }}
                  className="rounded-xl text-muted-foreground"
                >
                  <X size={13} />
                </Button>
              </div>
              {emailError && (
                <p className="text-xs text-destructive font-medium flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {emailError}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="bg-white border-2 border-destructive/20 shadow-xl rounded-[2.5rem] overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none text-destructive">
          <ShieldAlert size={120} />
        </div>
        <CardContent className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
              <ShieldAlert size={24} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-lg font-bold text-destructive tracking-tight">Zona de Eliminación</p>
              <p className="text-xs text-muted-foreground font-medium">Esta acción eliminará permanentemente el restaurante y todos sus datos vinculados.</p>
            </div>
          </div>

          <div className="p-6 bg-destructive/5 border-2 border-destructive/10 rounded-3xl mb-8">
            <p className="text-sm text-destructive font-bold leading-relaxed">
              Atención: Al eliminar "{tenant.name}", se borrarán menús, pedidos, configuraciones y accesos de personal.
              No hay forma de revertir esta operación.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={handleDelete}
            className="border-2 border-destructive/20 text-destructive hover:bg-destructive hover:text-white hover:border-destructive rounded-xl font-black text-[10px] uppercase tracking-[0.2em] px-8 h-12 transition-all active:scale-95">
            {deleting ? 'Eliminando...' : `Eliminar Permanentemente`}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
