'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Package, Clock, CheckCircle, CookingPot, ShoppingBag, Truck } from 'lucide-react'

const PENDING_ORDER_KEY = 'tgo-pending-order'
const MAX_AGE_MS = 4 * 60 * 60 * 1000
const DISMISS_KEY = 'tgo-pending-order-dismissed'

interface PendingOrder {
  orderNumber: string
  tenantSlug: string
  orderId: string
  createdAt: number
}

type OrderStatus = 'awaiting_payment' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

const statusConfig: Record<OrderStatus, { label: string; icon: any; color: string; bg: string; ring: string }> = {
  awaiting_payment: { label: 'Pendiente de pago', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/30' },
  pending:          { label: 'Pendiente', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/30' },
  confirmed:        { label: 'Confirmado', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
  preparing:        { label: 'Preparando', icon: CookingPot, color: 'text-sky-400', bg: 'bg-sky-500/10', ring: 'ring-sky-500/30' },
  ready:            { label: 'Listo', icon: ShoppingBag, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
  delivered:        { label: 'Entregado', icon: Truck, color: 'text-zinc-400', bg: 'bg-zinc-500/10', ring: 'ring-zinc-500/30' },
  cancelled:        { label: 'Cancelado', icon: X, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/30' },
}

export default function ActiveOrderBanner() {
  const [pending, setPending] = useState<PendingOrder | null>(null)
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_ORDER_KEY)
      if (!raw) {
        setChecked(true)
        return
      }

      const data: PendingOrder = JSON.parse(raw)
      if (!data.orderNumber || !data.tenantSlug) {
        setChecked(true)
        return
      }

      const age = Date.now() - data.createdAt
      if (age > MAX_AGE_MS) {
        localStorage.removeItem(PENDING_ORDER_KEY)
        setChecked(true)
        return
      }

      const dismissedRaw = localStorage.getItem(DISMISS_KEY)
      if (dismissedRaw === data.orderNumber) {
        setDismissed(true)
        setChecked(true)
        return
      }

      setPending(data)

      fetch(`/api/${data.tenantSlug}/orders/verify-payment-by-number?orderNumber=${data.orderNumber}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(res => {
          if (res.status === 'cancelled') {
            localStorage.removeItem(PENDING_ORDER_KEY)
            setPending(null)
            return
          }
          if (res.status && res.status !== 'awaiting_payment') {
            setOrderStatus(res.status)
          }
        })
        .catch(() => {})
        .finally(() => setChecked(true))
    } catch {
      setChecked(true)
    }
  }, [])

  if (!checked || !pending || dismissed) return null

  const cfg = orderStatus && orderStatus in statusConfig
    ? statusConfig[orderStatus as OrderStatus]
    : null

  const StatusIcon = cfg?.icon || Package

  return (
    <div className="sticky top-0 z-50 w-full bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href={`/${pending.tenantSlug}/tracking/${pending.orderNumber}`}
          className="flex items-center gap-3 flex-1 min-w-0 group"
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ${cfg ? cfg.ring : 'ring-white/10'} ${cfg ? cfg.bg : 'bg-white/5'}`}>
            <StatusIcon size={16} className={cfg ? cfg.color : 'text-zinc-400'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              Pedido #{pending.orderNumber}
            </p>
            <p className="text-[11px] flex items-center gap-1">
              {cfg ? (
                <span className={cfg.color}>{cfg.label}</span>
              ) : (
                <span className="text-zinc-400">Tocá para ver el seguimiento</span>
              )}
              <span className="text-zinc-600">→</span>
            </p>
          </div>
        </Link>
        <button
          onClick={() => {
            setDismissed(true)
            try { localStorage.setItem(DISMISS_KEY, pending.orderNumber) } catch {}
          }}
          className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center shrink-0 transition-colors"
          aria-label="Cerrar"
        >
          <X size={14} className="text-zinc-400" />
        </button>
      </div>
    </div>
  )
}
