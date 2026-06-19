'use client'

import { useState } from 'react'

interface Props {
  orderId: string
  token: string
  orderNumber: string
  deliveryAddress: {
    street: string
    number: string
    apt?: string
    city: string
  }
  onArrived: (order: any) => void
}

export default function DeliveryArrivalButton({
  orderId,
  token,
  orderNumber,
  deliveryAddress,
  onArrived,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleArrive() {
    setLoading(true)
    setError('')

    try {
      let lat = 0
      let lng = 0

      const simulateGps = process.env.NEXT_PUBLIC_DELIVERY_SIMULATE_GPS === 'true'

      if (simulateGps) {
        // En modo simulación, usar coordenadas mock (el server salta la validación GPS)
        lat = -34.603722
        lng = -58.381592
      } else {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          })
        })
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      }

      const res = await fetch(`/api/delivery/${orderId}/arrive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-delivery-token': token,
        },
        body: JSON.stringify({ lat, lng }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al confirmar llegada')
      }

      onArrived({
        _id: orderId,
        orderNumber,
        deliveryAddress,
        deliveryConfirmation: { status: 'arrived' },
      })
    } catch (err: any) {
      if (err.code === 1) {
        setError('Permiso de ubicación denegado. Activá el GPS en tu dispositivo.')
      } else {
        setError(err.message || 'Error al confirmar llegada')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 p-6 shadow-sm">
      <div className="text-center mb-4">
        <div className="text-5xl mb-3">📍</div>
        <h2 className="font-bold text-lg">¿Llegaste al destino?</h2>
        <p className="text-sm text-zinc-500 mt-1">
          {deliveryAddress.street} {deliveryAddress.number}
          {deliveryAddress.apt ? `, ${deliveryAddress.apt}` : ''}
        </p>
      </div>

      <button
        onClick={handleArrive}
        disabled={loading}
        className="w-full py-4 rounded-xl bg-amber-500 text-white font-bold text-base hover:bg-amber-600 transition-all disabled:opacity-50 shadow-lg shadow-amber-200"
      >
        {loading ? 'Confirmando...' : '✅ Llegué al destino'}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
      )}

      <p className="mt-4 text-xs text-zinc-400 text-center">
        Se registrará tu ubicación para verificar la entrega
      </p>
    </div>
  )
}
