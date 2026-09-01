'use client'

import { useState } from 'react'
import posthog from 'posthog-js'

interface Props {
  customerName?: string
  reviewUrl: string | null
  tenantSlug: string
  locationId: string
  orderId: string
  primaryColor: string
  backgroundColor: string
  children: React.ReactNode
}

export default function GoogleReviewPrompt({
  customerName,
  reviewUrl,
  tenantSlug,
  locationId,
  orderId,
  primaryColor,
  backgroundColor,
  children,
}: Props) {
  const [declined, setDeclined] = useState(false)

  if (!reviewUrl || declined) {
    return <>{children}</>
  }

  return (
    <div className="text-center space-y-4">
      <p className="text-lg font-medium">
        ¿Podrías dejar una reseña en Google para apoyar al restaurante?
      </p>

      <a
        href={reviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          posthog.capture('review_cta_clicked', {
            destination: 'google',
            tenantSlug,
            locationId,
            orderId,
          })
        }}
        className="block w-full py-3 px-6 rounded-2xl font-bold text-base"
        style={{ backgroundColor: primaryColor, color: backgroundColor }}
      >
        ⭐ Dejar una reseña en Google
      </a>

      <p className="text-xs opacity-40">
        Tu opinión ayuda al restaurante a seguir creciendo
      </p>

      <button
        onClick={() => {
          posthog.capture('review_cta_clicked', {
            destination: 'internal',
            tenantSlug,
            locationId,
            orderId,
          })
          setDeclined(true)
        }}
        className="text-sm underline opacity-40 hover:opacity-70"
      >
        Prefiero dejar feedback privado
      </button>
    </div>
  )
}
