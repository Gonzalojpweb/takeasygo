'use client'

import { useState, useEffect } from 'react'
import {
  Clock, MapPin, Phone, Mail, Printer, MessageCircle,
  CreditCard, Wallet, BadgePercent, Gift, Star, ChevronDown,
  Truck, UtensilsCrossed, Building2, ShoppingBag, History, FileText,
} from 'lucide-react'
import OrderStatusButton from '../OrderStatusButton'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import { toast } from 'sonner'
import type { BoardContextPanelRenderProps } from '@/components/shared/operations-board'

interface OrderItem {
  _id: string
  status: string
  createdAt: string
  orderNumber: string
  orderMode?: string
  customer: { name: string; phone?: string; email?: string; phoneHash?: string }
  total: number
  subtotal?: number
  discountAmount?: number
  deliveryAddress?: { street: string; number: string; apt?: string; city?: string; coordinates?: { lat: number; lng: number } }
  deliveryCost?: number
  deliveryDistance?: number
  deliveryConfirmation?: { status?: string; deliveryPersonName?: string; customerCode?: { code?: string | null } | string | null }
  items?: any[]
  notes?: string
  statusTimestamps?: Record<string, string>
  payment?: { method?: string; status?: string; surchargeAmount?: number; surchargePercent?: number; baseTotal?: number; platformFeeAmount?: number; transferConfirmed?: boolean }
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
  delivery: { label: 'DELIVERY', icon: Truck, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  'dine-in': { label: 'EN EL LOCAL', icon: UtensilsCrossed, color: 'bg-sky-100 text-sky-700 border-sky-200' },
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

function buildAdminWhatsAppLink(phone: string | undefined, order: OrderItem): string | null {
  if (!phone) return null
  const clean = phone.replace(/[^\d]/g, '')
  if (!clean) return null
  const modeLabel = order.orderMode === 'delivery' ? 'DELIVERY' : order.orderMode === 'takeaway' ? 'TAKE AWAY' : order.orderMode === 'dine-in' ? 'EN EL LOCAL' : 'CORPORATIVO'
  const msg = `Hola ${order.customer.name}, tu pedido #${order.orderNumber} (${modeLabel}) está ${STATUS_LABELS[order.status]?.toLowerCase() || order.status}.`
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`
}

export default function OrderContextPanel({ item, tenantSlug, onClose, onRefresh }: BoardContextPanelRenderProps<OrderItem>) {
  const [activeTab, setActiveTab] = useState<Tab>('detalles')
  const status = STATUS_LABELS[item.status] || item.status
  const statusDot = STATUS_DOT[item.status] || 'bg-zinc-400'
  const timestamps = item.statusTimestamps || {}
  const mode = MODE_CONFIG[item.orderMode || 'takeaway']
  const ModeIcon = mode?.icon || ShoppingBag
  const waLink = buildAdminWhatsAppLink(item.customer.phone, item)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'detalles', label: 'Detalles' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'historial', label: 'Historial' },
  ]

  return (
    <div className="w-full h-full bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header — centered title */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="w-7" />
        <h3 className="text-sm font-bold text-foreground">
          Pedido #{item.orderNumber}
        </h3>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg hover:bg-muted/80 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-all shrink-0"
        >
          ×
        </button>
      </div>

      {/* Mode + Status badges — centered */}
      <div className="flex items-center justify-center gap-2 px-4 pb-3">
        {mode && (
          <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border', mode.color)}>
            <ModeIcon size={10} />
            {mode.label}
          </span>
        )}
        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border',
          item.status === 'preparing' ? 'bg-orange-100 text-orange-700 border-orange-200' :
          item.status === 'ready' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
          item.status === 'confirmed' ? 'bg-blue-100 text-blue-700 border-blue-200' :
          item.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
          item.status === 'en_ruta' ? 'bg-sky-100 text-sky-700 border-sky-200' :
          'bg-zinc-100 text-zinc-600 border-zinc-200'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', statusDot)} />
          {status}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-all border-b-2',
              activeTab === tab.key
                ? 'text-orange-600 border-orange-500'
                : 'text-muted-foreground/50 border-transparent hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {activeTab === 'detalles' && <DetallesTab item={item} waLink={waLink} />}
        {activeTab === 'timeline' && <TimelineTab timestamps={timestamps} />}
        {activeTab === 'historial' && <HistorialTab item={item} tenantSlug={tenantSlug} />}
      </div>

      {/* Footer — Actions */}
      <div className="px-4 py-3 border-t border-border/50 space-y-2">
        {/* Secondary actions row */}
        <div className="flex items-center gap-2">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border/60 text-xs font-semibold text-foreground hover:bg-muted/50 transition-all"
            >
              <MessageCircle size={13} className="text-emerald-500" />
              Enviar mensaje
            </a>
          )}
          {item.customer.phone && (
            <a
              href={`tel:${item.customer.phone}`}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border/60 text-xs font-semibold text-foreground hover:bg-muted/50 transition-all"
            >
              <Phone size={13} className="text-muted-foreground" />
              Llamar
            </a>
          )}
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
              className="h-9 w-9 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center justify-center shrink-0"
              title="Reimprimir pedido"
            >
              <Printer size={13} />
            </button>
          )}
        </div>
        {/* Primary CTA */}
        <OrderStatusButton
          orderId={item._id}
          currentStatus={item.status}
          tenantSlug={tenantSlug}
          orderMode={item.orderMode}
          posSyncStatus={item.posSync?.status}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB: DETALLES
   ═══════════════════════════════════════════════════════════ */

function DetallesTab({ item, waLink }: { item: OrderItem; waLink: string | null }) {
  const hasDiscount = (item.discountAmount ?? 0) > 0 || item.qrPromoApplied
  const hasLoyalty = (item.loyaltyPointsUsed ?? 0) > 0

  return (
    <>
      {/* ── Cliente ─────────────────────────────────────── */}
      <Section title="Cliente">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-rose-600">
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
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-emerald-600 transition-colors"
              >
                <MessageCircle size={10} className="text-emerald-500" />
                {item.customer.phone}
              </a>
            )}
            {item.customer.email && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 truncate mt-0.5">
                <Mail size={10} />
                {item.customer.email}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Entrega ─────────────────────────────────────── */}
      {item.orderMode === 'delivery' && item.deliveryAddress && (
        <Section title="Entrega">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <MapPin size={12} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-foreground leading-relaxed">
                {item.deliveryAddress.street} {item.deliveryAddress.number}
                {item.deliveryAddress.apt ? `, ${item.deliveryAddress.apt}` : ''}
              </p>
            </div>
            {item.deliveryAddress.city && (
              <p className="text-[11px] text-muted-foreground/70 pl-5">{item.deliveryAddress.city}</p>
            )}
            <div className="flex items-center gap-3 pl-5">
              {item.deliveryDistance ? (
                <span className="text-[11px] text-muted-foreground/70">{item.deliveryDistance.toFixed(1)} km</span>
              ) : null}
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <Clock size={10} /> 20-30 min
              </span>
            </div>
            {item.deliveryConfirmation?.deliveryPersonName && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 pl-5">
                <Truck size={10} />
                <span>Repartidor: <strong>{item.deliveryConfirmation.deliveryPersonName}</strong></span>
              </div>
            )}
            {item.deliveryConfirmation?.customerCode && typeof item.deliveryConfirmation.customerCode === 'object' && (item.deliveryConfirmation.customerCode as any).code && (
              <div className="text-[11px] text-muted-foreground/70 pl-5">
                Código de entrega: <strong className="font-mono">{(item.deliveryConfirmation.customerCode as any).code}</strong>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Programado ──────────────────────────────────── */}
      {item.orderTiming === 'scheduled' && item.scheduledPickupAt && (
        <Section title="Programado para">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-amber-500" />
            <span className="text-xs font-medium text-foreground">{fmtDateTime(item.scheduledPickupAt)}</span>
          </div>
        </Section>
      )}

      {/* ── Productos ───────────────────────────────────── */}
      {item.items && item.items.length > 0 && (
        <Section title={`Productos (${item.items.length})`}>
          <div className="space-y-3">
            {item.items.map((orderItem: any, i: number) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      {orderItem.quantity}x {orderItem.name}
                    </p>
                    {orderItem.description && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">{orderItem.description}</p>
                    )}
                    {orderItem.selectedVariant && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        Variante: {orderItem.selectedVariant.name}
                      </p>
                    )}
                    {orderItem.customizations && orderItem.customizations.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {orderItem.customizations.map((cg: any, ci: number) => (
                          <p key={ci} className="text-[10px] text-muted-foreground/60">
                            <span className="font-medium">{cg.groupName}:</span>{' '}
                            {cg.selectedOptions?.map((o: any) => o.name).join(', ')}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-bold text-foreground tabular-nums shrink-0">
                    ${toPesos(orderItem.subtotal).toLocaleString('es-AR')}
                  </span>
                </div>
                {i < (item.items?.length ?? 0) - 1 && <div className="h-px bg-border/30 mt-3" />}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Notas ───────────────────────────────────────── */}
      {item.notes && (
        <Section title="Notas">
          <div className="px-3 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200/60">
            <p className="text-xs text-amber-900 leading-relaxed">{item.notes}</p>
          </div>
        </Section>
      )}

      {/* ── Pago ────────────────────────────────────────── */}
      <Section title="Pago">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {item.payment?.method === 'cash' ? <Wallet size={14} className="text-muted-foreground" /> : <CreditCard size={14} className="text-muted-foreground" />}
            <span className="text-xs font-semibold text-foreground">
              {PAYMENT_LABELS[item.payment?.method || ''] || item.payment?.method || '—'}
            </span>
            {item.payment?.status && (
              <span className={cn(
                'text-[9px] font-bold uppercase px-2 py-0.5 rounded-full',
                PAYMENT_STATUS_COLORS[item.payment.status] || 'bg-zinc-100 text-zinc-600'
              )}>
                {item.payment.status === 'approved' ? 'Pagado' : item.payment.status === 'pending' ? 'Pendiente' : item.payment.status}
              </span>
            )}
          </div>
          <span className="text-sm font-black text-foreground tabular-nums">
            ${toPesos(item.total).toLocaleString('es-AR')}
          </span>
        </div>

        {/* Pricing breakdown — only if surcharge exists */}
        {item.payment?.baseTotal != null && item.payment.baseTotal > 0 && item.payment.surchargeAmount ? (
          <div className="mt-2 space-y-1 pl-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/60">Precio de carta</span>
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">${toPesos(item.payment.baseTotal).toLocaleString('es-AR')}</span>
            </div>
            {item.orderMode === 'delivery' && (item.deliveryCost ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/60">🚚 Envío</span>
                <span className="text-[10px] text-muted-foreground/70 tabular-nums">${toPesos(item.deliveryCost!).toLocaleString('es-AR')}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/60">
                Recargo MP{item.payment.surchargePercent ? ` (${item.payment.surchargePercent.toFixed(1)}%)` : ''}
              </span>
              <span className="text-[10px] text-amber-600 tabular-nums">+${toPesos(item.payment.surchargeAmount).toLocaleString('es-AR')}</span>
            </div>
          </div>
        ) : null}
      </Section>

      {/* ── Beneficios ──────────────────────────────────── */}
      {(hasDiscount || hasLoyalty || (item.rewardItems?.length ?? 0) > 0) && (
        <Section title="Beneficios">
          <div className="space-y-1.5">
            {hasDiscount && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <BadgePercent size={12} />
                <span>Descuento: -${toPesos(item.discountAmount ?? 0).toLocaleString('es-AR')}</span>
                {item.promoCode && <span className="text-[10px] text-muted-foreground">({item.promoCode})</span>}
              </div>
            )}
            {hasLoyalty && (
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <Star size={12} />
                <span>{item.loyaltyPointsUsed} puntos usados{item.loyaltyDiscountAmount ? ` (-${toPesos(item.loyaltyDiscountAmount).toLocaleString('es-AR')})` : ''}</span>
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
          </div>
        </Section>
      )}

      {/* ── POS ─────────────────────────────────────────── */}
      {item.posSync?.status && item.posSync.status !== 'not_applicable' && (
        <Section title="POS">
          <span className={cn(
            'inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
            item.posSync.status === 'synced' ? 'bg-emerald-100 text-emerald-700' :
            item.posSync.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-amber-100 text-amber-700'
          )}>
            {item.posSync.status}
          </span>
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
   TAB: HISTORIAL
   ═══════════════════════════════════════════════════════════ */

interface CustomerHistoryOrder {
  _id: string
  orderNumber: string
  status: string
  total: number
  orderMode?: string
  createdAt: string
  items: { name: string; quantity: number; subtotal: number }[]
  customerName: string
}

interface CustomerHistoryData {
  orders: CustomerHistoryOrder[]
  totalOrders: number
  totalSpent: number
  avgTicket: number
  tenantName: string
}

const ORDER_MODE_BADGE: Record<string, string> = {
  takeaway: 'bg-amber-100 text-amber-700',
  delivery: 'bg-sky-100 text-sky-700',
  'dine-in': 'bg-emerald-100 text-emerald-700',
  business: 'bg-purple-100 text-purple-700',
}

function HistorialTab({ item, tenantSlug }: { item: OrderItem; tenantSlug: string }) {
  const [history, setHistory] = useState<CustomerHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [promoText, setPromoText] = useState('')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  useEffect(() => {
    if (!item.customer?.phoneHash) {
      setLoading(false)
      setError(true)
      return
    }
    setLoading(true)
    setError(false)
    fetch(`/api/${tenantSlug}/orders/customer-history?phoneHash=${item.customer.phoneHash}`)
      .then(res => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then((data: CustomerHistoryData) => {
        setHistory(data)
        setPromoText(`una promoción especial por tus ${data.totalOrders} pedidos`)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [item.customer?.phoneHash, tenantSlug])

  const customerPhone = item.customer.phone?.replace(/[^\d]/g, '')
  const customerName = item.customer.name || 'Cliente'
  const promoMessage = `Hola ${customerName}, gracias por tus ${history?.totalOrders || 0} pedidos en ${history?.tenantName || 'nuestro local'}. Te ofrecemos ${promoText}. ¡Te esperamos!`
  const promoLink = customerPhone
    ? `https://api.whatsapp.com/send?phone=${customerPhone}&text=${encodeURIComponent(promoMessage)}`
    : null

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground">Cargando historial del cliente...</p>
      </div>
    )
  }

  if (error || !history) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <History size={18} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs font-bold text-foreground">Historial no disponible</p>
          <p className="text-[10px] text-muted-foreground mt-1">Requiere plan Crecimiento o Premium</p>
        </div>
      </div>
    )
  }

  if (history.orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <ShoppingBag size={18} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs font-bold text-foreground">Sin pedidos recientes</p>
          <p className="text-[10px] text-muted-foreground mt-1">Este cliente no tiene pedidos en los últimos 3 meses</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Customer Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2.5 rounded-xl bg-primary/5 border border-primary/10">
          <p className="font-black text-lg text-primary tabular-nums">{history.totalOrders}</p>
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Pedidos</p>
        </div>
        <div className="text-center p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <p className="font-black text-lg text-emerald-700 tabular-nums">${toPesos(history.totalSpent).toLocaleString('es-AR')}</p>
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Total</p>
        </div>
        <div className="text-center p-2.5 rounded-xl bg-amber-50 border border-amber-200">
          <p className="font-black text-lg text-amber-700 tabular-nums">${toPesos(history.avgTicket).toLocaleString('es-AR')}</p>
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Ticket avg</p>
        </div>
      </div>

      {/* Order List */}
      <div className="space-y-1.5">
        {history.orders.map(order => {
          const isExpanded = expandedOrder === order._id
          const itemsPreview = order.items.slice(0, 2).map(i => `${i.quantity}x ${i.name}`).join(', ')
          const hasMore = order.items.length > 2
          return (
            <div key={order._id} className="rounded-xl border border-border/50 overflow-hidden">
              <button
                onClick={() => setExpandedOrder(isExpanded ? null : order._id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-foreground">#{order.orderNumber}</span>
                    <span className={cn(
                      'text-[8px] font-black uppercase px-1.5 py-0.5 rounded',
                      ORDER_MODE_BADGE[order.orderMode || 'takeaway'] || 'bg-zinc-100 text-zinc-600'
                    )}>
                      {order.orderMode === 'dine-in' ? 'LOCAL' : order.orderMode === 'delivery' ? 'DEL' : order.orderMode === 'business' ? 'CORP' : 'TA'}
                    </span>
                    <span className={cn(
                      'text-[8px] font-bold uppercase px-1.5 py-0.5 rounded',
                      order.status === 'delivered' ? 'bg-zinc-100 text-zinc-600' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                      'bg-emerald-100 text-emerald-700'
                    )}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {itemsPreview}{hasMore ? ` +${order.items.length - 2} más` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-foreground tabular-nums">${toPesos(order.total).toLocaleString('es-AR')}</p>
                  <p className="text-[9px] text-muted-foreground">{fmtDate(order.createdAt)}</p>
                </div>
                <ChevronDown size={12} className={cn(
                  'text-muted-foreground shrink-0 transition-transform',
                  isExpanded && 'rotate-180'
                )} />
              </button>
              {isExpanded && (
                <div className="px-3 pb-2.5 pt-0.5 border-t border-border/30 space-y-1">
                  {order.items.map((oi, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{oi.quantity}x {oi.name}</span>
                      <span className="font-bold text-foreground/70 tabular-nums">${toPesos(oi.subtotal).toLocaleString('es-AR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* WhatsApp Promo */}
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={12} className="text-emerald-600" />
          <span className="text-[10px] font-black uppercase text-emerald-700">Enviar promoción por WhatsApp</span>
        </div>
        <div className="text-[10px] text-emerald-800 bg-white rounded-lg p-2.5 border border-emerald-200 leading-relaxed">
          Hola <strong>{customerName}</strong>, gracias por tus <strong>{history.totalOrders} pedidos</strong> en <strong>{history.tenantName}</strong>. Te ofrecemos{' '}
          <input
            type="text"
            value={promoText}
            onChange={e => setPromoText(e.target.value)}
            className="inline-block w-auto min-w-[120px] max-w-[200px] px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="una promoción"
          />
          . ¡Te esperamos!
        </div>
        {promoLink ? (
          <a
            href={promoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageCircle size={12} />
            Abrir WhatsApp
          </a>
        ) : (
          <p className="text-[10px] text-muted-foreground text-center">Sin número de teléfono registrado</p>
        )}
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   SHARED: Section wrapper
   ═══════════════════════════════════════════════════════════ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{title}</h4>
      {children}
    </div>
  )
}
