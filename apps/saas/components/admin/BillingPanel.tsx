'use client'

import { useState } from 'react'
import { CheckCircle2, Zap, Star, Rocket, ExternalLink, X, AlertCircle, Loader2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLAN_LABELS, PLAN_FEATURES_LANDING, type Plan } from '@/lib/plans'
import { BILLING_CONFIG, type BillablePlan } from '@/lib/billing-config'
import DowngradeWarningModal from './DowngradeWarningModal'
import { isPremiumPlan } from '@/lib/plans'

interface SubscriptionInfo {
  status: string | null
  plan: string | null
  nextBillingDate: string | null
}

interface Props {
  currentPlan: Plan
  tenantSlug: string
  subscription: SubscriptionInfo
  /** WhatsApp de TakeasyGO para pedir High Ticket (solo dígitos). */
  supportWhatsapp?: string | null
}

const PLAN_ICONS: Record<BillablePlan, React.FC<{ size?: number; className?: string }>> = {
  try:  Rocket,
  buy:  Zap,
  full: Star,
}

const PLAN_CARD_COLORS: Record<BillablePlan, string> = {
  try:  'border-emerald-500/30 bg-emerald-500/5',
  buy:  'border-blue-500/30 bg-blue-500/5',
  full: 'border-primary/30 bg-primary/5',
}

const PLAN_ACCENT: Record<BillablePlan, string> = {
  try:  'text-emerald-600',
  buy:  'text-blue-600',
  full: 'text-primary',
}

const PLAN_BTN: Record<BillablePlan, string> = {
  try:  'bg-emerald-600 hover:bg-emerald-700 text-white',
  buy:  'bg-blue-600 hover:bg-blue-700 text-white',
  full: 'bg-primary hover:bg-primary/90 text-white',
}

const BILLABLE: BillablePlan[] = ['try', 'buy', 'full']
const BILLABLE_ORDER: Record<string, number> = { try: 0, buy: 1, full: 2, trial: -1, anfitrion: -1 }

// High Ticket no se contrata con la suscripción de Mercado Pago: lo activa el
// equipo de TakeasyGO desde el superadmin (07/11/2026).

export default function BillingPanel({ currentPlan, tenantSlug, subscription, supportWhatsapp }: Props) {
  const isHigh = currentPlan === 'high'
  const [loading, setLoading] = useState<BillablePlan | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downgradeTarget, setDowngradeTarget] = useState<BillablePlan | null>(null)

  const currentOrder = BILLABLE_ORDER[currentPlan] ?? -1

  function isUpgrade(plan: BillablePlan): boolean {
    return BILLABLE_ORDER[plan] > currentOrder
  }

  function isDowngrade(plan: BillablePlan): boolean {
    return BILLABLE_ORDER[plan] < currentOrder && currentOrder >= 0
  }

  async function handleSubscribe(targetPlan: BillablePlan) {
    if (isDowngrade(targetPlan)) {
      setDowngradeTarget(targetPlan)
      return
    }
    await doSubscribe(targetPlan)
  }

  async function doSubscribe(targetPlan: BillablePlan) {
    setError(null)
    setLoading(targetPlan)
    try {
      const res = await fetch(`/api/${tenantSlug}/billing/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al iniciar suscripción')
      window.location.href = data.initPoint
    } catch (err: any) {
      setError(err.message)
      setLoading(null)
    }
  }

  async function handleCancel() {
    if (!confirm('¿Cancelar la suscripción? Tu plan bajará a Inicial.')) return
    setError(null)
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/billing/cancel`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cancelar')
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setCancelLoading(false)
    }
  }

  const hasActiveSub = subscription.status === 'authorized'
  const hasPendingSub = subscription.status === 'pending'

  return (
    <div className="space-y-8">
      {/* Estado actual */}
      <div className="rounded-2xl border-2 border-border/60 bg-card p-6">
        <p className="text-xs uppercase font-black tracking-widest text-muted-foreground mb-3">Plan actual</p>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-3xl font-black text-foreground">{PLAN_LABELS[currentPlan]}</p>
            {hasActiveSub && subscription.nextBillingDate && (
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Próxima facturación: {new Date(subscription.nextBillingDate).toLocaleDateString('es-AR')}
              </p>
            )}
            {hasPendingSub && (
              <p className="text-xs text-amber-600 mt-1 font-medium flex items-center gap-1">
                <AlertCircle size={12} /> Pago pendiente — completá el pago en MercadoPago
              </p>
            )}
          </div>

          {hasActiveSub && (
            <button
              onClick={handleCancel}
              disabled={cancelLoading}
              className="flex items-center gap-2 text-xs font-bold text-destructive hover:opacity-70 transition-opacity disabled:opacity-50"
            >
              {cancelLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Cancelar suscripción
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* High Ticket: lo activa TakeasyGO (sin suscripción de Mercado Pago) */}
      <div className={cn('rounded-3xl border-2 p-6 flex flex-col gap-4 md:flex-row md:items-center', isHigh ? 'border-fuchsia-500/40 bg-fuchsia-500/5 ring-2 ring-fuchsia-500/40 ring-offset-2 ring-offset-background' : 'border-fuchsia-500/30 bg-fuchsia-500/5')}>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-fuchsia-600">
            <Rocket size={18} />
            <span className="font-black text-sm uppercase tracking-wide">{PLAN_LABELS.high}</span>
            {isHigh && <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-fuchsia-500/10">Activo</span>}
          </div>
          <p className="text-2xl font-black text-fuchsia-600">$100.000<span className="text-sm font-medium text-muted-foreground"> ARS/mes</span></p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...PLAN_FEATURES_LANDING.high.featured, ...PLAN_FEATURES_LANDING.high.extra].map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-fuchsia-600" />{f}</li>
            ))}
          </ul>
        </div>
        {isHigh ? (
          <p className="text-xs text-muted-foreground md:max-w-[200px]">Tu plan lo administra el equipo de TakeasyGO. Para cualquier cambio, escribinos.</p>
        ) : supportWhatsapp ? (
          <a href={`https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(`Hola, quiero el plan Élite para ${tenantSlug}`)}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-xl bg-fuchsia-600 px-5 py-3 text-center text-sm font-bold text-white hover:bg-fuchsia-700">Quiero Élite</a>
        ) : (
          <p className="text-xs text-muted-foreground md:max-w-[200px]">Lo activa el equipo de TakeasyGO: escribinos para pasarte a Élite.</p>
        )}
      </div>

      {/* Cards de planes */}
      {!isHigh && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {BILLABLE.map((plan) => {
          const config = BILLING_CONFIG[plan]
          const Icon = PLAN_ICONS[plan]
          const isCurrent = currentPlan === plan
          const features = PLAN_FEATURES_LANDING[plan]
          const isLoading = loading === plan
          const upgrade = isUpgrade(plan)
          const downgrade = isDowngrade(plan)

          return (
            <div
              key={plan}
              className={cn(
                'rounded-3xl border-2 p-6 flex flex-col gap-5 transition-all duration-300',
                isCurrent
                  ? PLAN_CARD_COLORS[plan] + ' ring-2 ring-offset-2 ring-offset-background'
                  : 'border-border/60 bg-card hover:border-border',
                isCurrent && plan === 'try' && 'ring-emerald-500/50',
                isCurrent && plan === 'buy' && 'ring-blue-500/50',
                isCurrent && isPremiumPlan(plan) && 'ring-primary/50',
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className={cn('flex items-center gap-2 mb-1', PLAN_ACCENT[plan])}>
                    <Icon size={18} />
                    <span className="font-black text-sm uppercase tracking-wide">{PLAN_LABELS[plan]}</span>
                  </div>
                  <p className={cn('text-2xl font-black', PLAN_ACCENT[plan])}>
                    ${config.amount.toLocaleString('es-AR')}
                    <span className="text-sm font-medium text-muted-foreground"> ARS/mes</span>
                  </p>
                </div>
                {isCurrent && (
                  <span className={cn('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full', PLAN_ACCENT[plan], PLAN_CARD_COLORS[plan])}>
                    Activo
                  </span>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2 flex-1">
                {features.featured.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 size={14} className={cn('mt-0.5 shrink-0', PLAN_ACCENT[plan])} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <div className={cn('text-center text-xs font-bold py-3 rounded-xl', PLAN_CARD_COLORS[plan], PLAN_ACCENT[plan])}>
                  Plan activo
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={!!loading || cancelLoading}
                  className={cn(
                    'w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50',
                    upgrade ? 'bg-zinc-900 hover:bg-zinc-800 text-white' : PLAN_BTN[plan]
                  )}
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : upgrade ? (
                    <>
                      <ArrowUpCircle size={16} />
                      Mejorar plan
                    </>
                  ) : downgrade ? (
                    <>
                      <ArrowDownCircle size={16} />
                      Reducir plan
                    </>
                  ) : (
                    <>
                      <ExternalLink size={14} />
                      Suscribirse
                    </>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        El pago se procesa de forma segura a través de MercadoPago. Podés cancelar en cualquier momento.
      </p>

      {/* Downgrade Warning Modal */}
      {downgradeTarget && (
        <DowngradeWarningModal
          currentPlan={currentPlan}
          targetPlan={downgradeTarget}
          onConfirm={() => {
            const target = downgradeTarget
            setDowngradeTarget(null)
            doSubscribe(target)
          }}
          onCancel={() => setDowngradeTarget(null)}
        />
      )}
    </div>
  )
}
