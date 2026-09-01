'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'

import RatingForm from './RatingForm'
import GoogleReviewPrompt from './GoogleReviewPrompt'
import LikeOrderItemsModal from './LikeOrderItemsModal'

interface OrderItem {
  _id: string
  name: string
  quantity: number
  menuItemId?: string
}

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
  reviewUrl?: string | null
  orderItems: OrderItem[]
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
  reviewUrl,
  orderItems,
}: Props) {
  const celebRef = useRef(false)
  const [showLikeModal, setShowLikeModal] = useState(false)

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
    <div className="mb-8 space-y-4 py-2">
      {/* Celebration header */}
      <div className="text-center space-y-2 py-2">
        <div className="text-5xl animate-bounce">🍽️</div>
        <p className="font-black text-xl">
          ¡Pedido completado{customerName ? `, ${customerName}` : ''}!
        </p>
        <p className="text-sm opacity-60">
          ¡Que lo disfrutes!
        </p>
      </div>

      {/* Rating form */}
      {ratingToken && (
        <GoogleReviewPrompt
          customerName={customerName}
          reviewUrl={reviewUrl ?? null}
          tenantSlug={tenantSlug}
          locationId={locationId}
          orderId={orderId}
          primaryColor={primaryColor}
          backgroundColor={backgroundColor}
        >
          <RatingForm
            orderId={orderId}
            orderNumber={orderNumber}
            tenantSlug={tenantSlug}
            token={ratingToken}
            primaryColor={primaryColor}
            backgroundColor={backgroundColor}
            textColor={textColor}
          />
        </GoogleReviewPrompt>
      )}

      {/* Buttons side by side */}
      <div className="flex gap-2">
        {ratingToken && (
          <button
            onClick={() => setShowLikeModal(true)}
            className="flex-1 py-3 rounded-2xl font-bold text-sm text-center transition-all active:scale-[0.97]"
            style={{ backgroundColor: primaryColor, color: backgroundColor }}
          >
            ❤️ Likear
          </button>
        )}
        <a
          href={`/${tenantSlug}/menu/${locationId}/takeaway`}
          className="flex-1 py-3 rounded-2xl font-bold text-sm text-center"
          style={{ backgroundColor: primaryColor + '20', color: primaryColor }}
        >
          Volver al menú
        </a>
      </div>

      {/* Like modal */}
      {ratingToken && (
        <LikeOrderItemsModal
          open={showLikeModal}
          onClose={() => setShowLikeModal(false)}
          items={orderItems}
          orderId={orderId}
          ratingToken={ratingToken}
          tenantSlug={tenantSlug}
          tenantName={tenantName}
          primaryColor={primaryColor}
        />
      )}
    </div>
  )
}
