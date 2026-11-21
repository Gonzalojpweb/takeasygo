'use client'

import { useRouter } from 'next/navigation'
import { useCheckout } from '@/contexts/CheckoutContext'
import { cn } from '@/lib/utils'
import { isServiceOpen } from '@/lib/availability'
import { toast } from 'sonner'
import { isOfferedInMode, SALES_CHANNEL_INFO } from '@/lib/sales-channels'

export default function DeliveryModeToggle() {
  const router = useRouter()
  const { state, dispatch } = useCheckout()
  const { deliveryMode, tenantSlug, locationPath, serviceHours, timezone, deliveryConfig } = state

  // 21/11/2026: descuentos % de carta que no valen en la modalidad elegida (el
  // carrito ya volvió al precio de lista: acá se explica por qué).
  const currentMode = deliveryMode ? 'delivery' : 'takeaway'
  const lostDiscounts = Array.from(new Map(
    state.cart
      .filter(l => l.menuDiscount && !isOfferedInMode(l.menuDiscount.channels, currentMode))
      .map(l => [l.menuDiscount!.promotionId, l.menuDiscount!] as const)
  ).values())

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
    router.replace(`/${tenantSlug}/menu/${locationPath}/delivery/checkout`)
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
            router.replace(`/${tenantSlug}/menu/${locationPath}/takeaway/checkout`)
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
      {lostDiscounts.map(d => (
        <p key={d.promotionId} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-medium mt-2">
          🏷️ El descuento «{d.title}» es solo {d.channels.map(c => SALES_CHANNEL_INFO[c].short).join(' y ')}: con esta modalidad esos platos van a precio normal.
        </p>
      ))}
    </div>
  )
}
