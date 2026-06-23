'use client'

import { useRouter } from 'next/navigation'
import { useCheckout } from '@/contexts/CheckoutContext'
import { cn } from '@/lib/utils'

export default function DeliveryModeToggle() {
  const router = useRouter()
  const { state, dispatch } = useCheckout()
  const { deliveryMode, tenantSlug, locationId } = state

  return (
    <div>
      <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide mb-3">Modalidad</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'SET_DELIVERY_MODE', delivery: false })
            dispatch({ type: 'SET_DELIVERY_QUOTE', quote: { loading: false, cost: 0, distance: 0, withinRange: false, error: null } })
            dispatch({ type: 'SET_DELIVERY_CONFIRMED', confirmed: false })
            router.replace(`/${tenantSlug}/menu/${locationId}/takeaway/checkout`)
          }}
          className={cn(
            'flex-1 py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all',
            !deliveryMode
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
          )}
        >
          🥡 Para llevar
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'SET_DELIVERY_MODE', delivery: true })
            router.replace(`/${tenantSlug}/menu/${locationId}/delivery/checkout`)
          }}
          className={cn(
            'flex-1 py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all',
            deliveryMode
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
          )}
        >
          🚚 Delivery
        </button>
      </div>
    </div>
  )
}
