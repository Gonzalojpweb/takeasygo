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
  const resolvedLocationId = useRef<string | null>(null)

  const checkPromo = useCallback(async () => {
    let effectiveSource = source
    let locationId: string | null = null
    if (!effectiveSource && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      const pathLocationId = pathParts[3]
      if (pathLocationId && pathLocationId.length === 24) {
        effectiveSource = 'qr-auto'
        locationId = pathLocationId
      }
    }
    if (!effectiveSource) {
      setLoading(false)
      return
    }
    try {
      const apiUrl = `/api/${tenantSlug}/qr-promo?source=${effectiveSource}${urlPromoSlug ? `&promo=${urlPromoSlug}` : ''}${locationId ? `&locationId=${locationId}` : ''}&_=${Date.now()}`
      const res = await fetch(apiUrl)
      if (!res.ok) {
        console.error(`QR promo fetch failed: ${res.status} ${res.statusText}`)
        return
      }
      const data = await res.json()
      if (data.show && data.promo) {
        const slug = data.resolvedSlug || urlPromoSlug
        resolvedSlug.current = slug
        resolvedLocationId.current = locationId

        setPromo(data.promo)
        setShow(true)
        if (data.loyaltyMessaging) setLoyaltyMsg(data.loyaltyMessaging)

        if (data.promo.type === 'discount') {
          sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
            discountPercentage: data.promo.discountPercentage,
            tenantSlug,
            checkoutDiscountLabel: data.promo.checkoutDiscountLabel || 'Descuento QR',
            promoSlug: slug || undefined,
            source: effectiveSource || undefined,
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
        locationId: resolvedLocationId.current || undefined,
      }),
    })
  }, [tenantSlug, source])

  return { promo, loading, show, loyaltyMsg, dismiss }
}
