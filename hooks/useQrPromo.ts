'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { QrPromoData, LoyaltyMessaging } from '@/components/promo/types'

interface UseQrPromoReturn {
  promo: QrPromoData | null
  loading: boolean
  show: boolean
  loyaltyMsg: LoyaltyMessaging | null
  dismiss: () => void
}

export function useQrPromo(tenantSlug: string): UseQrPromoReturn {
  const searchParams = useSearchParams()
  const source = searchParams?.get('source') || ''
  const urlPromoSlug = searchParams?.get('promo') || ''

  const [show, setShow] = useState(false)
  const [promo, setPromo] = useState<QrPromoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loyaltyMsg, setLoyaltyMsg] = useState<LoyaltyMessaging | null>(null)
  const resolvedSlug = useRef<string>('')

  const checkPromo = useCallback(async () => {
    let effectiveSource = source
    if (!effectiveSource && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      const locationId = pathParts[3]
      if (locationId && locationId.length === 24) {
        effectiveSource = 'qr-auto'
      }
    }
    if (!effectiveSource) {
      setLoading(false)
      return
    }
    try {
      const apiUrl = `/api/${tenantSlug}/qr-promo?source=${source}${urlPromoSlug ? `&promo=${urlPromoSlug}` : ''}&_=${Date.now()}`
      const res = await fetch(apiUrl)
      const data = await res.json()
      if (data.show && data.promo) {
        const slug = data.resolvedSlug || urlPromoSlug
        resolvedSlug.current = slug

        setPromo(data.promo)
        setShow(true)
        if (data.loyaltyMessaging) setLoyaltyMsg(data.loyaltyMessaging)

        if (data.promo.type === 'discount') {
          sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
            discountPercentage: data.promo.discountPercentage,
            tenantSlug,
            checkoutDiscountLabel: data.promo.checkoutDiscountLabel || 'Descuento QR',
            promoSlug: slug || undefined,
            source: source || undefined,
          }))
        }
      }
    } catch (e) {
      console.error('Error checking promo:', e)
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, source, urlPromoSlug])

  useEffect(() => {
    checkPromo()
    const interval = setInterval(checkPromo, 30000)
    return () => clearInterval(interval)
  }, [checkPromo])

  const dismiss = useCallback(() => {
    setShow(false)
    fetch(`/api/${tenantSlug}/qr-promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        promoSlug: resolvedSlug.current || undefined,
      }),
    })
  }, [tenantSlug, source])

  return { promo, loading, show, loyaltyMsg, dismiss }
}
