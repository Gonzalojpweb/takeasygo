'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Package } from 'lucide-react'

const PENDING_ORDER_KEY = 'tgo-pending-order'
const MAX_AGE_MS = 4 * 60 * 60 * 1000
const DISMISS_KEY = 'tgo-pending-order-dismissed'

interface PendingOrder {
  orderNumber: string
  tenantSlug: string
  orderId: string
  createdAt: number
}

export default function ActiveOrderBanner() {
  const [pending, setPending] = useState<PendingOrder | null>(null)
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
          if (res.status === 'confirmed' || res.status === 'preparing' || res.status === 'ready' || res.status === 'delivered' || res.status === 'cancelled') {
            localStorage.removeItem(PENDING_ORDER_KEY)
            setPending(null)
          }
        })
        .catch(() => {})
        .finally(() => setChecked(true))
    } catch {
      setChecked(true)
    }
  }, [])

  if (!checked || !pending || dismissed) return null

  return (
    <div className="sticky top-0 z-50 w-full bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href={`/${pending.tenantSlug}/tracking/${pending.orderNumber}`}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <Package size={18} className="text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              Pedido #{pending.orderNumber}
            </p>
            <p className="text-[11px] text-zinc-400">Tocá para ver el seguimiento →</p>
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
