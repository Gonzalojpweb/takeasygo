'use client'

import { useState, useEffect } from 'react'
import confetti from 'canvas-confetti'
import { useNotificationSound } from '@/hooks/useNotificationSound'

interface Props {
  orderId: string
  tenantSlug: string
  locationId: string
  primaryColor: string
  backgroundColor: string
  textColor: string
  onConfirmed?: () => void
  customerName?: string
}

export default function ConfirmPickupButton({
  orderId,
  tenantSlug,
  locationId,
  primaryColor,
  backgroundColor,
  textColor,
  onConfirmed,
  customerName,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const { play: playCelebration } = useNotificationSound('/pop.mp3')

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
      onConfirmed?.()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  // Momento 08: confetti + sonido + haptic al confirmar retiro
  useEffect(() => {
    if (!confirmed) return
    playCelebration()
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200])
    const end = Date.now() + 1500
    let raf: number
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 80, origin: { x: 0, y: 0.6 }, colors: [primaryColor, '#fbbf24', '#34d399', '#ff6b6b'] })
      confetti({ particleCount: 6, angle: 120, spread: 80, origin: { x: 1, y: 0.6 }, colors: [primaryColor, '#fbbf24', '#34d399', '#ff6b6b'] })
      if (Date.now() < end) { raf = requestAnimationFrame(frame) }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [confirmed, primaryColor, playCelebration])

  if (confirmed) {
    return (
      <div className="text-center space-y-5 py-4">
        <div className="text-5xl animate-bounce">✅</div>
        <div>
          <p className="font-black text-xl mb-1">¡Pedido retirado!</p>
          <p className="text-sm opacity-60">
            {customerName
              ? `🎉 ¡Gracias ${customerName}, que lo disfrutes!`
              : 'Gracias por tu compra. ¡Que lo disfrutes!'}
          </p>
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
