'use client'

import { useCheckout } from '@/contexts/CheckoutContext'
import SchedulePicker from '@/components/menu/SchedulePicker'
import { cn } from '@/lib/utils'

export default function TakeawayScheduleSection() {
  const { state, dispatch } = useCheckout()
  const { scheduledOrdersConfig, scheduleOrder, scheduledPickupAt, tenantSlug, locationId } = state

  if (!scheduledOrdersConfig?.enabled) return null

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide">¿Cuándo pasás a buscarlo?</h2>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { dispatch({ type: 'SET_SCHEDULE_ORDER', schedule: false }); dispatch({ type: 'SET_SCHEDULED_PICKUP', at: null }) }}
          className={cn(
            'p-3 rounded-xl border-2 text-left transition-all',
            !scheduleOrder
              ? 'border-zinc-900 bg-zinc-50'
              : 'border-zinc-200 bg-white hover:border-zinc-300',
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex items-center justify-center',
              !scheduleOrder ? 'border-zinc-900' : 'border-zinc-300',
            )}>
              {!scheduleOrder && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
            </div>
            <span className="text-sm font-bold text-zinc-900">Ahora</span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-tight">Se prepara al instante</p>
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_SCHEDULE_ORDER', schedule: true })}
          className={cn(
            'p-3 rounded-xl border-2 text-left transition-all',
            scheduleOrder
              ? 'border-zinc-900 bg-zinc-50'
              : 'border-zinc-200 bg-white hover:border-zinc-300',
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex items-center justify-center',
              scheduleOrder ? 'border-zinc-900' : 'border-zinc-300',
            )}>
              {scheduleOrder && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
            </div>
            <span className="text-sm font-bold text-zinc-900">Programar</span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-tight">Elegí hora de retiro</p>
        </button>
      </div>

      {scheduleOrder && (
        <SchedulePicker
          tenantSlug={tenantSlug}
          locationId={locationId}
          maxAdvanceHours={scheduledOrdersConfig.maxAdvanceHours ?? 24}
          onSelect={(pickupAt) => dispatch({ type: 'SET_SCHEDULED_PICKUP', at: pickupAt })}
        />
      )}
    </div>
  )
}
