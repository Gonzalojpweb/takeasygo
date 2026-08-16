'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2, Store, Globe, CreditCard, ShieldAlert, ArrowLeft, Loader2, Save, AlertTriangle, Mail, Pencil, X, Check, Tag, Percent, Banknote } from 'lucide-react'
import { cn, fmt } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PLAN_LABELS, PLAN_TAGLINES, PLAN_PRICE } from '@/lib/plans'
import type { Plan } from '@/lib/plans'

const PLAN_FEATURES_SHORT: Record<Plan, string[]> = {
  trial:     ['Menú + pedidos takeaway', 'Panel básico de órdenes', 'Hasta 30 pedidos → Informe ICO gratis'],
  try:       ['Menú + pedidos + MercadoPago', 'Impresión automática en cocina', '1 sede / 1 impresora'],
  buy:       ['Todo Inicial incluido', 'Reportes, múltiples sedes y usuarios', 'ICO — Fiabilidad Operativa'],
  full:      ['Todo Crecimiento incluido', 'Analytics avanzados + TPP + horarios', 'ICO diagnóstico completo'],
  anfitrion: ['Dashboard + Menú digital', 'Configuración del restaurante', 'Facturación y suscripción'],
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
    isOperational: tenant.isOperational ?? true,
    alwaysVisible: tenant.alwaysVisible ?? false,
    featuresReservations: tenant.features?.reservations ?? false,
    featuresCrmEnabled: tenant.features?.crm?.enabled ?? false,
    featuresTgoGrowthPushEnabled: tenant.features?.tgoGrowthPushEnabled ?? false,
    businessEnabled: tenant.business?.enabled ?? false,
    sosMaxLimit: tenant.loyalty?.sosMaxLimit ?? 0,
    // Labels de tipo de promoción
    promotionLabelSale: tenant.promotionLabels?.sale ?? 'PROMO',
    promotionLabelInfo: tenant.promotionLabels?.info ?? 'INFO',
    promotionLabelAnnouncement: tenant.promotionLabels?.announcement ?? 'AVISO',
    promotionLabelLoyalty: tenant.promotionLabels?.loyalty ?? 'CLUB',
    commissionPercent: tenant.mpOAuth?.commissionPercent ?? '',
    takeasygoCommissionOverride: tenant.takeasygoCommissionOverride ?? '',
    transferCommissionPercent: tenant.transfer?.commissionPercent ?? '',
    transferEnabled: tenant.transfer?.enabled ?? false,
    // Mensajes del modal de Club
    loyaltyModalSubtitle: tenant.loyaltyMessaging?.modalSubtitle ?? 'Completá tus datos para unirte al club y comenzar a sumar puntos',
    loyaltySuccessTitle: tenant.loyaltyMessaging?.successTitle ?? '¡Registro exitoso!',
    loyaltySuccessMessage: tenant.loyaltyMessaging?.successMessage ?? 'Bienvenido al club de fidelización',
    loyaltyWelcomePointsMsg: tenant.loyaltyMessaging?.welcomePointsMsg ?? '{points} puntos de bienvenida',
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
          isOperational: form.isOperational,
          alwaysVisible: form.alwaysVisible,
          features: { reservations: form.featuresReservations, crm: { enabled: form.featuresCrmEnabled }, tgoGrowthPushEnabled: form.featuresTgoGrowthPushEnabled },
          business: { enabled: form.businessEnabled },
          sosMaxLimit: form.sosMaxLimit,
          commissionPercent: form.commissionPercent === '' ? null : Number(form.commissionPercent),
          takeasygoCommissionOverride: form.takeasygoCommissionOverride === '' ? null : Number(form.takeasygoCommissionOverride),
          transferCommissionPercent: form.transferCommissionPercent === '' ? null : Number(form.transferCommissionPercent),
          transferEnabled: form.transferEnabled,
          promotionLabels: {
            sale: form.promotionLabelSale,
            info: form.promotionLabelInfo,
            announcement: form.promotionLabelAnnouncement,
            loyalty: form.promotionLabelLoyalty,
          },
          loyaltyMessaging: {
            modalSubtitle: form.loyaltyModalSubtitle,
            successTitle: form.loyaltySuccessTitle,
            successMessage: form.loyaltySuccessMessage,
            welcomePointsMsg: form.loyaltyWelcomePointsMsg,
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al actualizar el tenant')
      }
      toast.success('Tenant actualizado correctamente')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar el tenant')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar permanentemente el tenant "${tenant.name}"?\nEsta acción no se puede deshacer.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant._id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al eliminar el tenant')
      }
      toast.success('Tenant eliminado del sistema')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar el tenant')
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
                {(['anfitrion', 'trial', 'try', 'buy', 'full'] as Plan[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setForm(prev => {
                        const newForm = { ...prev, plan: p }
                        // Sincronizar Reservaciones
                        if (p === 'buy' || p === 'full') {
                          newForm.featuresReservations = true
                        } else if (p === 'try' || p === 'trial' || p === 'anfitrion') {
                          newForm.featuresReservations = false
                        }
                        // Si baja de plan, deshabilitar Business
                        if (p !== 'buy' && p !== 'full') {
                          newForm.businessEnabled = false
                        }
                        return newForm
                      })
                    }}
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
                    ) : p === 'anfitrion' ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">Lanzamiento · {PLAN_PRICE[p]}</span>
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
                const planOrder: Plan[] = ['anfitrion', 'trial', 'try', 'buy', 'full']
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

            {/* Comisión por tenant */}
            <div className="pt-6 border-t border-border/40">
              <div className="flex items-center gap-3 mb-4">
                <CreditCard size={16} className="text-primary" />
                <div>
                  <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">Comisión por split</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Porcentaje de comisión que cobra la plataforma. Vacío = usar el valor global de PlatformConfig.</p>
                </div>
              </div>
              <div className="max-w-[200px]">
                <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Comisión %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.commissionPercent}
                  onChange={e => setForm(p => ({ ...p, commissionPercent: e.target.value }))}
                  placeholder="Global"
                  className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            {/* ── TakeasyGO commission override ───────────────────── */}
            <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem]">
              <div className="flex items-center gap-3">
                <Percent size={16} className="text-muted-foreground/50" />
                <div>
                  <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">Comisión TakeasyGO</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Override de la comisión global. Vacío = usar valor global.</p>
                </div>
              </div>
              <div className="max-w-[140px]">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.takeasygoCommissionOverride}
                  onChange={e => setForm(p => ({ ...p, takeasygoCommissionOverride: e.target.value }))}
                  placeholder="Global"
                  className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            {/* ── Transferencia bancaria ────────────────────────────── */}
            <div className="flex flex-col items-start gap-4 p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] max-w-sm">
              <div className="flex items-center gap-3">
                <Banknote size={16} className="text-muted-foreground/50" />
                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Transferencia bancaria</span>
              </div>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, transferEnabled: !p.transferEnabled }))}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  form.transferEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform',
                  form.transferEnabled ? 'translate-x-6' : 'translate-x-0.5'
                )} />
              </button>
              <div className="flex flex-col gap-2 w-full max-w-[200px]">
                <label className="text-[10px] font-bold text-muted-foreground/60">Comisión transferencia %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.transferCommissionPercent}
                  onChange={e => setForm(p => ({ ...p, transferCommissionPercent: e.target.value }))}
                  placeholder="Global"
                  className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-mono text-center focus:outline-none focus:border-primary/40 transition-all"
                />
                <p className="text-[10px] text-muted-foreground/60">Vacío = usar valor global de PlatformConfig</p>
              </div>
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
                  <div className={cn("w-2 h-2 rounded-full", form.isOperational ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]")} />
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Ventas Activas (Operativo)</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, isOperational: !p.isOperational }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center",
                    form.isOperational ? 'bg-primary' : 'bg-amber-500'
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                    form.isOperational ? 'left-[26px]' : 'left-1'
                  )} />
                </button>
              </div>
              {!form.isOperational && (
                <p className="text-[10px] text-amber-600 font-bold px-5">
                  ⚠️ El local se mostrará como "Próximamente". Se podrá ver el menú pero no comprar.
                </p>
              )}

              <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", form.alwaysVisible ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-muted-foreground/30")} />
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Destacado en Explore</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, alwaysVisible: !p.alwaysVisible }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center",
                    form.alwaysVisible ? 'bg-blue-500' : 'bg-muted-foreground/20'
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                    form.alwaysVisible ? 'left-[26px]' : 'left-1'
                  )} />
                </button>
              </div>
              {form.alwaysVisible && (
                <p className="text-[10px] text-blue-600 font-bold px-5">
                  ℹ️ Visible en Explore sin importar la distancia del usuario. Ideal para delivery.
                </p>
              )}

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

              <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", form.featuresCrmEnabled ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-muted-foreground/30")} />
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">CRM — Base de Clientes</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, featuresCrmEnabled: !p.featuresCrmEnabled }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center",
                    form.featuresCrmEnabled ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                    form.featuresCrmEnabled ? 'left-[26px]' : 'left-1'
                  )} />
                </button>
              </div>

              {(form.plan === 'buy' || form.plan === 'full') && (
                <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", form.featuresTgoGrowthPushEnabled ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-muted-foreground/30")} />
                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Push TGO — WhatsApp Reward Advance</span>
                  </div>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, featuresTgoGrowthPushEnabled: !p.featuresTgoGrowthPushEnabled }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative flex items-center",
                      form.featuresTgoGrowthPushEnabled ? 'bg-primary' : 'bg-muted-foreground/20'
                    )}>
                    <div className={cn(
                      "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                      form.featuresTgoGrowthPushEnabled ? 'left-[26px]' : 'left-1'
                    )} />
                  </button>
                </div>
              )}

              {form.plan === 'buy' || form.plan === 'full' ? (
                <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", form.businessEnabled ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-muted-foreground/30")} />
                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Módulo Business (Corp)</span>
                  </div>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, businessEnabled: !p.businessEnabled }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative flex items-center",
                      form.businessEnabled ? 'bg-primary' : 'bg-muted-foreground/20'
                    )}>
                    <div className={cn(
                      "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                      form.businessEnabled ? 'left-[26px]' : 'left-1'
                    )} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] h-[58px] max-w-sm opacity-40 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Módulo Business (Corp)</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Plan Crecimiento+</span>
                  </div>
                  <div className="w-12 h-6 rounded-full bg-muted-foreground/10" />
                </div>
              )}
            </div>

            {/* SOS Max Limit (solo aplica si el plan es Premium) */}
            <div className={cn("space-y-3", form.plan === 'full' ? '' : 'opacity-30 pointer-events-none')}>
              <div className="p-5 rounded-2xl border-2 border-border/60 bg-muted/20">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">Límite SOS Máximo (por tenant)</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Tope máximo de Reward Advance que el admin de este tenant puede configurar</p>
                  </div>
                  <span className="text-2xl font-black tabular-nums">{fmt(form.sosMaxLimit)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5000}
                  step={10}
                  value={form.sosMaxLimit}
                  onChange={e => setForm(p => ({ ...p, sosMaxLimit: parseInt(e.target.value) || 0 }))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0 (desactivado)</span>
                  <span>5.000 (máx)</span>
                </div>
                {form.sosMaxLimit > 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-2">
                    El admin Premium podrá configurar el SOS hasta {fmt(form.sosMaxLimit)} puntos.
                  </p>
                )}
                {form.sosMaxLimit === 0 && (
                  <p className="text-xs text-muted-foreground font-medium mt-2">
                    SOS desactivado para este tenant.
                  </p>
                )}
                {form.plan !== 'full' && (
                  <p className="text-xs text-muted-foreground font-medium mt-2">
                    Solo disponible para plan Premium.
                  </p>
                )}
              </div>
            </div>

            {/* ── Labels de tipo de promoción ── */}
            <div className="pt-6 border-t border-border/40">
              <div className="flex items-center gap-3 mb-4">
                <Tag size={16} className="text-primary" />
                <div>
                  <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">Labels de Promociones</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Etiquetas que se muestran en los badges de cada tipo de promoción</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Venta</label>
                  <input
                    value={form.promotionLabelSale}
                    onChange={e => setForm(p => ({ ...p, promotionLabelSale: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Info</label>
                  <input
                    value={form.promotionLabelInfo}
                    onChange={e => setForm(p => ({ ...p, promotionLabelInfo: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Anuncio</label>
                  <input
                    value={form.promotionLabelAnnouncement}
                    onChange={e => setForm(p => ({ ...p, promotionLabelAnnouncement: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Club</label>
                  <input
                    value={form.promotionLabelLoyalty}
                    onChange={e => setForm(p => ({ ...p, promotionLabelLoyalty: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* ── Mensajes del modal de Club ── */}
            <div className="pt-6 border-t border-border/40">
              <div className="flex items-center gap-3 mb-4">
                <Mail size={16} className="text-primary" />
                <div>
                  <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">Mensajes del Club</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Textos del modal de registro al club de fidelización</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Subtítulo del modal</label>
                  <input
                    value={form.loyaltyModalSubtitle}
                    onChange={e => setForm(p => ({ ...p, loyaltyModalSubtitle: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                    placeholder="Completá tus datos para unirte al club..."
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Texto de puntos de bienvenida</label>
                  <input
                    value={form.loyaltyWelcomePointsMsg}
                    onChange={e => setForm(p => ({ ...p, loyaltyWelcomePointsMsg: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                    placeholder="{points} puntos de bienvenida"
                  />
                  <p className="text-[9px] text-muted-foreground/50 mt-1">Usá {'{points}'} como placeholder del número</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Título de registro exitoso</label>
                  <input
                    value={form.loyaltySuccessTitle}
                    onChange={e => setForm(p => ({ ...p, loyaltySuccessTitle: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                    placeholder="¡Registro exitoso!"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/60 block mb-1">Mensaje de registro exitoso</label>
                  <input
                    value={form.loyaltySuccessMessage}
                    onChange={e => setForm(p => ({ ...p, loyaltySuccessMessage: e.target.value }))}
                    className="w-full bg-muted/40 border-2 border-border/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-primary/40 transition-all"
                    placeholder="Bienvenido al club de fidelización"
                  />
                </div>
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
