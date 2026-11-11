'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { QrPromoData, LoyaltyMessaging } from '@/components/promo/types'
import { qrPromoMenuPath } from '@/lib/menu/location-ref'

interface UseQrPromoReturn {
  promo: QrPromoData | null
  loading: boolean
  show: boolean
  loyaltyMsg: LoyaltyMessaging | null
  accentColor: string
  tenantLogo: string | null
  tenantName: string | null
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
  const [accentColor, setAccentColor] = useState('#F74211')
  const [tenantLogo, setTenantLogo] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState<string | null>(null)
  const resolvedSlug = useRef<string>('')
  const resolvedLocationId = useRef<string | null>(null)

  const checkPromo = useCallback(async () => {
    // La sede viaja como está en la dirección (slug, _id viejo o '' en el link
    // general /<comercio>/menu) y la resuelve el servidor. Antes solo se
    // reconocía un _id de 24 caracteres: con las direcciones por nombre de sede
    // (31/10) la campaña dejó de aparecer al entrar al menú.
    if (typeof window === 'undefined') return
    const path = qrPromoMenuPath(window.location.pathname)
    if (!path.show) {
      setLoading(false)
      return
    }
    const effectiveSource = source || 'qr-auto'
    try {
      const qs = new URLSearchParams({ source: effectiveSource, location: path.locationRef, _: String(Date.now()) })
      if (urlPromoSlug) qs.set('promo', urlPromoSlug)
      const res = await fetch(`/api/${tenantSlug}/qr-promo?${qs}`)
      if (!res.ok) {
        console.error(`QR promo fetch failed: ${res.status} ${res.statusText}`)
        return
      }
      const data = await res.json()
      if (data.show && data.promo) {
        const slug = data.resolvedSlug || urlPromoSlug
        resolvedSlug.current = slug
        resolvedLocationId.current = data.locationId ?? null

        setPromo(data.promo)
        setShow(true)
        if (data.loyaltyMessaging) setLoyaltyMsg(data.loyaltyMessaging)
        if (data.accentColor) setAccentColor(data.accentColor)
        if (data.tenantLogo) setTenantLogo(data.tenantLogo)
        if (data.tenantName) setTenantName(data.tenantName)

        if (data.promo.type === 'discount') {
          sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
            discountPercentage: data.promo.discountPercentage,
            tenantSlug,
            checkoutDiscountLabel: data.promo.checkoutDiscountLabel || 'Descuento QR',
            promoSlug: slug || undefined,
            source: effectiveSource || undefined,
            memberOnly: data.memberOnly ?? false,
            cooldownHours: data.cooldownHours ?? 24,
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

  return { promo, loading, show, loyaltyMsg, accentColor, tenantLogo, tenantName, dismiss }
}
