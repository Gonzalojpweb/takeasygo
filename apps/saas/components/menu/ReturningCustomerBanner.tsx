'use client'

import { useState, useEffect } from 'react'
import { X, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CustomerIdentity {
  name: string
  totalOrders: number
  lastOrderAt: number
}

const DISMISS_KEY_PREFIX = 'tgo-customer-banner-dismissed'

export default function ReturningCustomerBanner({ tenantSlug }: { tenantSlug: string }) {
  const [identity, setIdentity] = useState<CustomerIdentity | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      const dismissedRaw = localStorage.getItem(`${DISMISS_KEY_PREFIX}-${tenantSlug}`)
      if (dismissedRaw) {
        setDismissed(true)
        return
      }

      const raw = localStorage.getItem(`tgo-customer-${tenantSlug}`)
      if (!raw) return

      const data: CustomerIdentity = JSON.parse(raw)
      if (!data.name || !data.totalOrders) return

      // Don't show for first-time customers (totalOrders === 0 after just 1 order? No — starts at 1)
      if (data.totalOrders < 1) return

      setIdentity(data)
    } catch {}
  }, [tenantSlug])

  if (!identity || dismissed) return null

  const isSuperCustomer = identity.totalOrders >= 10

  return (
    <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/20">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 ring-1 ring-white/20">
            <Heart size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {isSuperCustomer
                ? `¡Ya sos casi parte del equipo, ${identity.name}!`
                : `¡Hola de vuelta, ${identity.name}!`
              }
            </p>
            <p className="text-[11px] text-emerald-100">
              {isSuperCustomer
                ? `Más de ${identity.totalOrders} pedidos con nosotros 🙌`
                : `${identity.totalOrders} ${identity.totalOrders === 1 ? 'pedido' : 'pedidos'} con nosotros`
              }
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true)
            try { localStorage.setItem(`${DISMISS_KEY_PREFIX}-${tenantSlug}`, '1') } catch {}
          }}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
          aria-label="Cerrar"
        >
          <X size={14} className="text-white/70" />
        </button>
      </div>
    </div>
  )
}
