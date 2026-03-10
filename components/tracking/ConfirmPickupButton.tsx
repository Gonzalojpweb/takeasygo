'use client'

import { useState } from 'react'

interface Props {
  orderId: string
  tenantSlug: string
  locationId: string
  primaryColor: string
  backgroundColor: string
  textColor: string
}

export default function ConfirmPickupButton({
  orderId,
  tenantSlug,
  locationId,
  primaryColor,
  backgroundColor,
  textColor,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/pickup`, {
        method: 'PATCH',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al confirmar')
      }
      setConfirmed(true)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (confirmed) {
    return (
      <div className="text-center space-y-5 py-4">
        <div className="text-5xl">✅</div>
        <div>
          <p className="font-black text-xl mb-1">¡Pedido retirado!</p>
          <p className="text-sm opacity-60">Gracias por tu compra. ¡Que lo disfrutes!</p>
        </div>
        <a
          href={`/${tenantSlug}/menu/${locationId}/takeaway`}
          className="block w-full py-4 rounded-2xl font-bold text-center text-base"
          style={{ backgroundColor: primaryColor, color: backgroundColor }}
        >
          Volver al menú
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity"
        style={{ backgroundColor: primaryColor, color: backgroundColor }}
      >
        {loading ? 'Confirmando...' : '✅ Confirmar retiro'}
      </button>
      {error && (
        <p className="text-center text-sm text-red-500">{error}</p>
      )}
      <p className="text-center text-xs opacity-40">
        Al confirmar, registramos que retiraste tu pedido
      </p>
    </div>
  )
}
