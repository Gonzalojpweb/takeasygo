'use client'

import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

import RatingForm from './RatingForm'

interface Props {
  customerName: string
  locationId: string
  tenantName: string
  tenantSlug: string
  orderNumber: string
  orderId: string
  ratingToken: string | null
  primaryColor: string
  backgroundColor: string
  textColor: string
}

export default function PostDeliveryCelebration({
  customerName,
  locationId,
  tenantName,
  tenantSlug,
  orderNumber,
  orderId,
  ratingToken,
  primaryColor,
  backgroundColor,
  textColor,
}: Props) {
  const celebRef = useRef(false)

  // Subtle confetti on mount
  useEffect(() => {
    if (celebRef.current) return
    celebRef.current = true
    const end = Date.now() + 1000
    let raf: number
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 90,
        spread: 120,
        origin: { x: 0.5, y: 0.3 },
        colors: [primaryColor, '#facc15', '#34d399', '#f97316'],
        gravity: 0.8,
        scalar: 1.2,
      })
      if (Date.now() < end) {
        raf = requestAnimationFrame(frame)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [primaryColor])

  return (
    <div className="mb-8 space-y-6">
      {/* Celebration header */}
      <div className="text-center space-y-2 py-4">
        <div className="text-5xl animate-bounce">🍽️</div>
        <p className="font-black text-2xl">
          ¡Pedido completado{customerName ? `, ${customerName}` : ''}!
        </p>
        <p className="text-sm opacity-60">
          Gracias por elegirnos. ¡Que lo disfrutes!
        </p>
      </div>

      {/* Rating form */}
      {ratingToken && (
        <RatingForm
          orderId={orderId}
          orderNumber={orderNumber}
          tenantSlug={tenantSlug}
          token={ratingToken}
          primaryColor={primaryColor}
          backgroundColor={backgroundColor}
          textColor={textColor}
        />
      )}

      {/* Back to like */}
      {ratingToken && (
        <a
          href={`/${tenantSlug}/menu/${locationId}/takeaway?likes=${orderId}&token=${ratingToken}`}
          className="block w-full text-center py-4 rounded-2xl font-bold text-base"
          style={{ backgroundColor: primaryColor, color: backgroundColor }}
        >
          ❤️ Volver y likear
        </a>
      )}

      {/* Back to menu */}
      <a
        href={`/${tenantSlug}/menu/${locationId}/takeaway`}
        className={`block w-full text-center py-4 rounded-2xl font-bold text-base ${ratingToken ? 'mt-2' : ''}`}
        style={{ backgroundColor: primaryColor + '20', color: primaryColor }}
      >
        Volver al menú
      </a>
    </div>
  )
}
