'use client'

import { useCheckout } from '@/contexts/CheckoutContext'
import { toast } from 'sonner'
import { toPesos } from '@takeasygo/business'

export default function DeliveryAddressForm() {
  const { state, dispatch } = useCheckout()
  const { deliveryAddress, deliveryQuote, deliveryConfirmed, tenantSlug, locationId } = state

  async function handleQuote() {
    if (!deliveryAddress.street.trim() || !deliveryAddress.number.trim() || !deliveryAddress.city.trim()) {
      return toast.error('Completá calle, número y barrio')
    }
    dispatch({ type: 'SET_DELIVERY_QUOTE', quote: { loading: true, error: null } })
    try {
      const res = await fetch(`/api/${tenantSlug}/delivery/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          address: {
            street: deliveryAddress.street,
            number: deliveryAddress.number,
            apt: deliveryAddress.apt || '',
            city: deliveryAddress.city,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        dispatch({ type: 'SET_DELIVERY_QUOTE', quote: { loading: false, error: data.error || 'Error al calcular' } })
        return
      }
      if (!data.withinRange) {
        dispatch({ type: 'SET_DELIVERY_QUOTE', quote: { loading: false, error: data.error || 'Tu dirección está fuera del área de cobertura.' } })
        return
      }
      dispatch({
        type: 'SET_DELIVERY_QUOTE',
        quote: { loading: false, cost: data.cost, distance: data.distance, withinRange: true, error: null },
      })
      dispatch({ type: 'SET_DELIVERY_CONFIRMED', confirmed: true })
      toast.success('Costo de envío calculado')
    } catch {
      dispatch({ type: 'SET_DELIVERY_QUOTE', quote: { loading: false, error: 'Error de conexión. Intentá de nuevo.' } })
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide">Dirección de entrega</h2>

      <div className="flex gap-2">
        <input
          required
          placeholder="Calle *"
          value={deliveryAddress.street}
          onChange={e => dispatch({ type: 'SET_DELIVERY_ADDRESS', address: { street: e.target.value } })}
          className="flex-1 border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
        />
        <input
          required
          placeholder="Número *"
          value={deliveryAddress.number}
          onChange={e => dispatch({ type: 'SET_DELIVERY_ADDRESS', address: { number: e.target.value } })}
          className="w-24 border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
        />
      </div>

      <input
        placeholder="Piso, depto, casa o local"
        value={deliveryAddress.apt}
        onChange={e => dispatch({ type: 'SET_DELIVERY_ADDRESS', address: { apt: e.target.value } })}
        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
      />

      <input
        required
        placeholder="Barrio *"
        value={deliveryAddress.city}
        onChange={e => dispatch({ type: 'SET_DELIVERY_ADDRESS', address: { city: e.target.value } })}
        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
      />

      <button
        type="button"
        onClick={handleQuote}
        disabled={deliveryQuote.loading}
        className="w-full py-3 px-4 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {deliveryQuote.loading ? 'Calculando...' : deliveryConfirmed ? '✅ Costo calculado' : 'Calcular costo de envío'}
      </button>

      {deliveryQuote.error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <span className="text-base">⚠️</span> {deliveryQuote.error}
        </p>
      )}

      {deliveryConfirmed && deliveryQuote.withinRange && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-800 font-semibold flex items-center gap-2">
            <span>🚚</span> Envío: <span className="text-base">${toPesos(deliveryQuote.cost).toLocaleString('es-AR')}</span>
            <span className="text-xs text-emerald-600 font-normal">({deliveryQuote.distance} km)</span>
          </p>
        </div>
      )}
    </div>
  )
}
