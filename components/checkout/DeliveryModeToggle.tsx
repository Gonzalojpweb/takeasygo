'use client'

import { useRouter } from 'next/navigation'
import { useCheckout } from '@/contexts/CheckoutContext'
import { cn } from '@/lib/utils'
import { isServiceOpen } from '@/lib/availability'
import { toast } from 'sonner'

export default function DeliveryModeToggle() {
  const router = useRouter()
  const { state, dispatch } = useCheckout()
  const { deliveryMode, tenantSlug, locationId, serviceHours, timezone, deliveryConfig } = state

  const deliveryEnabled = deliveryConfig?.enabled !== false
  const deliveryBySchedule = isServiceOpen(serviceHours?.delivery, timezone)
  const deliveryAvailable = deliveryEnabled && deliveryBySchedule

  const handleDeliveryClick = () => {
    if (!deliveryEnabled) {
      toast.error('Delivery no habilitado', {
        description: 'El delivery no está habilitado para esta sede.',
      })
      return
    }
    if (!deliveryBySchedule) {
      toast.error('Fuera del horario de delivery', {
        description: 'El delivery no está disponible en este momento. Revisá los horarios de atención.',
      })
      return
    }
    dispatch({ type: 'SET_DELIVERY_MODE', delivery: true })
    router.replace(`/${tenantSlug}/menu/${locationId}/delivery/checkout`)
  }

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
          onClick={handleDeliveryClick}
          disabled={!deliveryAvailable}
          className={cn(
            'flex-1 py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all',
            !deliveryAvailable && 'opacity-40 cursor-not-allowed',
            deliveryMode
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
          )}
        >
          🚚 Delivery
        </button>
      </div>
      {!deliveryEnabled && (
        <p className="text-[10px] text-red-400 font-medium mt-2">
          🕐 Delivery no habilitado para esta sede
        </p>
      )}
      {deliveryEnabled && !deliveryBySchedule && serviceHours?.delivery && serviceHours.delivery.length > 0 && (
        <p className="text-[10px] text-red-400 font-medium mt-2">
          🕐 No hay delivery disponible en este horario
        </p>
      )}
    </div>
  )
}
