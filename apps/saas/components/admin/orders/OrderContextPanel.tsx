'use client'

import { useState } from 'react'
import {
  Clock, MapPin, Phone, Mail, Printer, MessageCircle,
  CreditCard, Wallet, BadgePercent, Gift, Star, ChevronDown,
  Truck, UtensilsCrossed, Building2, ShoppingBag, History, FileText,
} from 'lucide-react'
import { BoardContextPanelShell } from '@/components/shared/operations-board'
import OrderStatusButton from '../OrderStatusButton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { BoardContextPanelRenderProps } from '@/components/shared/operations-board'

interface OrderItem {
  _id: string
  status: string
  createdAt: string
  orderNumber: string
  orderMode?: string
  customer: { name: string; phone?: string; email?: string }
  total: number
  subtotal: number
  discountAmount?: number
  deliveryAddress?: { street: string; number: string; apt?: string; city?: string; coordinates?: { lat: number; lng: number } }
  deliveryCost?: number
  deliveryDistance?: number
  deliveryConfirmation?: { status?: string; deliveryPersonName?: string; customerCode?: { code?: string | null } | string | null }
  items?: any[]
  notes?: string
  statusTimestamps?: Record<string, string>
  payment?: { method?: string; status?: string; surchargeAmount?: number; baseTotal?: number; transferConfirmed?: boolean }
  posSync?: { status?: string }
  orderTiming?: string
  scheduledPickupAt?: string
  qrPromoApplied?: boolean
  promoCode?: string
  loyaltyPointsUsed?: number
  loyaltyDiscountAmount?: number
  rewardItems?: any[]
  printLog?: any[]
  locationName?: string
}

type Tab = 'detalles' | 'timeline' | 'historial'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Listo', en_ruta: 'En ruta', arrived: 'Llegó', delivered: 'Entregado', cancelled: 'Cancelado',
  awaiting_payment: 'Esperando pago', awaiting_confirmation: 'Confirmando transferencia',
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-400', confirmed: 'bg-blue-500', preparing: 'bg-orange-400',
  ready: 'bg-emerald-500', en_ruta: 'bg-sky-500', arrived: 'bg-amber-500',
  delivered: 'bg-zinc-400', cancelled: 'bg-red-400',
  awaiting_payment: 'bg-yellow-300', awaiting_confirmation: 'bg-blue-300',
}

const MODE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  takeaway: { label: 'TAKE AWAY', icon: ShoppingBag, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  delivery: { label: 'DELIVERY', icon: Truck, color: 'bg-sky-100 text-sky-700 border-sky-200' },
  'dine-in': { label: 'EN EL LOCAL', icon: UtensilsCrossed, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  business: { label: 'CORPORATIVO', icon: Building2, color: 'bg-purple-100 text-purple-700 border-purple-200' },
}

const PAYMENT_LABELS: Record<string, string> = {
  mercadopago: 'Mercado Pago', cash: 'Efectivo', transfer: 'Transferencia', kripton: 'Kripton',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const TIMELINE_STEPS = [
  { key: 'confirmedAt', label: 'Confirmado', dot: 'bg-blue-500' },
  { key: 'preparingAt', label: 'Preparando', dot: 'bg-orange-400' },
  { key: 'readyAt', label: 'Listo', dot: 'bg-emerald-500' },
  { key: 'enRutaAt', label: 'En ruta', dot: 'bg-sky-500' },
  { key: 'arrivedAt', label: 'Llegó', dot: 'bg-amber-500' },
  { key: 'deliveredAt', label: 'Entregado', dot: 'bg-zinc-400' },
  { key: 'cancelledAt', label: 'Cancelado', dot: 'bg-red-400' },
]

function fmtTime(ts: string | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts: string | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDateTime(ts: string | undefined): string {
  if (!ts) return ''
  return `${fmtDate(ts)} ${fmtTime(ts)}`
}

function elapsed(from: string, to?: string): string {
  const a = new Date(from).getTime()
  const b = to ? new Date(to).getTime() : Date.now()
  const diff = Math.max(0, b - a)
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}min` : `${hrs}h`
}

function buildAdminWhatsAppLink(phone: string | undefined, order: OrderItem): string | null {
  if (!phone) return null
  const clean = phone.replace(/[^\d]/g, '')
  if (!clean) return null
  const modeLabel = order.orderMode === 'delivery' ? 'DELIVERY' : order.orderMode === 'takeaway' ? 'TAKE AWAY' : order.orderMode === 'dine-in' ? 'EN EL LOCAL' : 'CORPORATIVO'
  const msg = `Hola ${order.customer.name}, tu pedido #${order.orderNumber} (${modeLabel}) está ${STATUS_LABELS[order.status]?.toLowerCase() || order.status}.`
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}}`
}

export default function OrderContextPanel({ item, tenantSlug, onClose, onRefresh }: BoardContextPanelRenderProps<OrderItem>) {
  const [activeTab, setActiveTab] = useState<Tab>('detalles')
  const status = STATUS_LABELS[item.status] || item.status
  const statusDot = STATUS_DOT[item.status] || 'bg-zinc-400'
  const timestamps = item.statusTimestamps || {}
  const mode = MODE_CONFIG[item.orderMode || 'takeaway']
  const ModeIcon = mode?.icon || ShoppingBag
  const waLink = buildAdminWhatsAppLink(item.customer.phone, item)

  const headerBadge = (
    <div className="flex items-center gap-1.5 shrink-0">
      {mode && (
        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border', mode.color)}>
          <ModeIcon size={10} />
          {mode.label}
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className={cn('w-2 h-2 rounded-full', statusDot)} />
        <span className="text-xs font-bold text-muted-foreground">{status}</span>
      </span>
    </div>
  )

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'detalles', label: 'Detalles', icon: FileText },
    { key: 'timeline', label: 'Timeline', icon: Clock },
    { key: 'historial', label: 'Historial', icon: History },
  ]

  return (
    <div className="w-full h-full bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-black text-base tracking-tight text-foreground truncate">
            #{item.orderNumber}
          </h3>
          {headerBadge}
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-all border-b-2',
                activeTab === tab.key
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'detalles' && <DetallesTab item={item} waLink={waLink} />}
        {activeTab === 'timeline' && <TimelineTab timestamps={timestamps} />}
        {activeTab === 'historial' && <HistorialTab timestamps={timestamps} status={item.status} />}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2">
        {['confirmed', 'preparing'].includes(item.status) && (
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`/api/${tenantSlug}/orders/${item._id}/reprint`, { method: 'POST' })
                if (!res.ok) throw new Error()
                toast.success('Reimprimiendo...')
              } catch { toast.error('Error al reimprimir') }
            }}
            className="h-8 px-3 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0"
          >
            <Printer size={12} />
            <span className="hidden xl:inline">Reimprimir</span>
          </button>
        )}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-3 rounded-lg border border-border/60 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title="Enviar WhatsApp al cliente"
          >
            <MessageCircle size={12} />
            <span className="hidden xl:inline">WhatsApp</span>
          </a>
        )}
        <div className="flex-1 flex justify-end">
          <OrderStatusButton
            orderId={item._id}
            currentStatus={item.status}
            tenantSlug={tenantSlug}
            orderMode={item.orderMode}
            compact
            posSyncStatus={item.posSync?.status}
          />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB: DETALLES
   ═══════════════════════════════════════════════════════════ */

function DetallesTab({ item, waLink }: { item: OrderItem; waLink: string | null }) {
  const timestamps = item.statusTimestamps || {}
  const hasDiscount = (item.discountAmount ?? 0) > 0 || item.qrPromoApplied
  const hasLoyalty = (item.loyaltyPointsUsed ?? 0) > 0

  return (
    <>
      {/* Cliente */}
      <Section title="Cliente">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-primary">
              {item.customer.name?.slice(0, 2).toUpperCase() || '??'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{item.customer.name}</p>
            {item.customer.phone && (
              <a
                href={waLink || '#'}
                target={waLink ? '_blank' : undefined}
                rel={waLink ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
              >
                <Phone size={10} /> {item.customer.phone}
              </a>
            )}
            {item.customer.email && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                <Mail size={10} /> {item.customer.email}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Entrega */}
      {item.orderMode === 'delivery' && item.deliveryAddress && (
        <Section title="Entrega">
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <MapPin size={12} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-emerald-800 font-medium">
                {item.deliveryAddress.street} {item.deliveryAddress.number}
                {item.deliveryAddress.apt ? `, ${item.deliveryAddress.apt}` : ''}
              </p>
              {item.deliveryAddress.city && (
                <p className="text-[10px] text-emerald-600">{item.deliveryAddress.city}</p>
              )}
              {item.deliveryDistance ? (
                <p className="text-[10px] text-emerald-600 mt-0.5">{item.deliveryDistance.toFixed(1)} km</p>
              ) : null}
            </div>
          </div>
          {item.deliveryConfirmation?.deliveryPersonName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Truck size={11} />
              <span>Repartidor: <strong>{item.deliveryConfirmation.deliveryPersonName}</strong></span>
            </div>
          )}
          {item.deliveryConfirmation?.customerCode && typeof item.deliveryConfirmation.customerCode === 'object' && (item.deliveryConfirmation.customerCode as any).code && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Código de entrega: <strong className="font-mono">{(item.deliveryConfirmation.customerCode as any).code}</strong></span>
            </div>
          )}
        </Section>
      )}

      {/* Programado */}
      {item.orderTiming === 'scheduled' && item.scheduledPickupAt && (
        <Section title="Programado para">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <Clock size={12} className="text-amber-600" />
            <span className="text-xs text-amber-800 font-medium">{fmtDateTime(item.scheduledPickupAt)}</span>
          </div>
        </Section>
      )}

      {/* Productos */}
      {item.items && item.items.length > 0 && (
        <Section title={`Productos (${item.items.length})`}>
          <div className="space-y-2">
            {item.items.map((orderItem: any, i: number) => (
              <div key={i} className="px-3 py-2 rounded-xl bg-muted/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {orderItem.quantity}x {orderItem.name}
                    </p>
                    {orderItem.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{orderItem.description}</p>
                    )}
                    {orderItem.selectedVariant && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Variante: {orderItem.selectedVariant.name}
                      </p>
                    )}
                    {orderItem.customizations && orderItem.customizations.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {orderItem.customizations.map((cg: any, ci: number) => (
                          <p key={ci} className="text-[10px] text-muted-foreground">
                            <span className="font-medium">{cg.groupName}:</span>{' '}
                            {cg.selectedOptions?.map((o: any) => o.name).join(', ')}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-bold text-foreground/70 tabular-nums shrink-0">
                    ${orderItem.subtotal.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Notas */}
      {item.notes && (
        <Section title="Nota del cliente">
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-800">{item.notes}</p>
          </div>
        </Section>
      )}

      {/* Pago */}
      <Section title="Pago">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {item.payment?.method === 'cash' ? <Wallet size={12} className="text-muted-foreground" /> : <CreditCard size={12} className="text-muted-foreground" />}
              <span className="text-xs font-medium text-foreground">
                {PAYMENT_LABELS[item.payment?.method || ''] || item.payment?.method || '—'}
              </span>
            </div>
            {item.payment?.status && (
              <span className={cn(
                'text-[9px] font-black uppercase px-1.5 py-0.5 rounded border',
                PAYMENT_STATUS_COLORS[item.payment.status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'
              )}>
                {item.payment.status === 'approved' ? 'Aprobado' : item.payment.status === 'pending' ? 'Pendiente' : item.payment.status}
              </span>
            )}
          </div>
          {item.payment?.surchargeAmount ? (
            <p className="text-[10px] text-muted-foreground">Recargo: +${item.payment.surchargeAmount.toLocaleString('es-AR')}</p>
          ) : null}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
            <span className="text-xs font-bold text-primary">Total</span>
            <span className="font-black text-lg text-primary tabular-nums">
              ${item.total.toLocaleString('es-AR')}
            </span>
          </div>
        </div>
      </Section>

      {/* Descuentos / Lealtad */}
      {(hasDiscount || hasLoyalty || item.rewardItems?.length) && (
        <Section title="Beneficios">
          {hasDiscount && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <BadgePercent size={12} />
              <span>Descuento: -${(item.discountAmount ?? 0).toLocaleString('es-AR')}</span>
              {item.promoCode && <span className="text-[10px] text-muted-foreground">({item.promoCode})</span>}
            </div>
          )}
          {hasLoyalty && (
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <Star size={12} />
              <span>{item.loyaltyPointsUsed} puntos usados{item.loyaltyDiscountAmount ? ` (-$${item.loyaltyDiscountAmount.toLocaleString('es-AR')})` : ''}</span>
            </div>
          )}
          {item.rewardItems && item.rewardItems.length > 0 && (
            <div className="space-y-1">
              {item.rewardItems.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-purple-700">
                  <Gift size={12} />
                  <span>{r.storeItemName} ({r.pointsCost} pts)</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* POS */}
      {item.posSync?.status && item.posSync.status !== 'not_applicable' && (
        <Section title="POS">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-black uppercase',
              item.posSync.status === 'synced' ? 'bg-emerald-100 text-emerald-700' :
              item.posSync.status === 'failed' ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            )}>
              {item.posSync.status}
            </span>
          </div>
        </Section>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB: TIMELINE
   ═══════════════════════════════════════════════════════════ */

function TimelineTab({ timestamps }: { timestamps: Record<string, string> }) {
  const active = TIMELINE_STEPS.filter(s => timestamps[s.key])

  if (active.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">Sin eventos registrados</p>
  }

  return (
    <div className="space-y-0">
      {active.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2.5 py-2">
          <div className="relative flex flex-col items-center">
            <span className={cn('w-3 h-3 rounded-full', step.dot)} />
            {i < active.length - 1 && <div className="w-px h-5 bg-border/60 mt-0.5" />}
          </div>
          <div className="flex-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{step.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{fmtTime(timestamps[step.key])}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB: HISTORIAL (con intervalos de tiempo)
   ═══════════════════════════════════════════════════════════ */

function HistorialTab({ timestamps, status }: { timestamps: Record<string, string>; status: string }) {
  const steps = TIMELINE_STEPS.filter(s => timestamps[s.key])

  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">Sin historial de cambios</p>
  }

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const nextStep = steps[i + 1]
        const from = timestamps[step.key]
        const to = nextStep ? timestamps[nextStep.key] : undefined
        const isActive = !to
        const interval = elapsed(from, to)

        return (
          <div key={step.key}>
            <div className="flex items-center gap-2.5 py-2">
              <div className="relative flex flex-col items-center">
                <span className={cn('w-3 h-3 rounded-full', step.dot, isActive && 'ring-2 ring-offset-1 ring-current/20')} />
                {i < steps.length - 1 && <div className="w-px h-3 bg-border/60 mt-0.5" />}
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{step.label}</span>
                  {isActive && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">actual</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{fmtTime(from)}</span>
                  <span className={cn(
                    'text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded',
                    isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}>
                    {interval}
                  </span>
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="ml-[5px] pl-4 py-0.5">
                <span className="text-[10px] text-muted-foreground">
                  → {nextStep.label}: {elapsed(from, timestamps[nextStep.key])}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SHARED: Section wrapper
   ═══════════════════════════════════════════════════════════ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{title}</h4>
      {children}
    </div>
  )
}
