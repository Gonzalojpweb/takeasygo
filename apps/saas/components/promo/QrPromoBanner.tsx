'use client'

import { usePathname } from 'next/navigation'
import { useQrPromo } from '@/hooks/useQrPromo'
import { PromoModal } from './PromoModal'
import { PromoHeader } from './PromoHeader'
import { PromoImage } from './PromoImage'
import { DiscountContent } from './DiscountContent'
import { InfoContent } from './InfoContent'
import { LoyaltyContent } from './LoyaltyContent'

interface QrPromoBannerProps {
  tenantSlug: string
}

export function QrPromoBanner({ tenantSlug }: QrPromoBannerProps) {
  const pathname = usePathname()
  const { promo, loading, show, loyaltyMsg, accentColor, tenantLogo, tenantName, dismiss } = useQrPromo(tenantSlug)

  const pathParts = pathname?.split('/').filter(Boolean) ?? []
  const isPublic = pathParts.length === 3
  const isTakeaway = pathParts.length === 4 && pathParts[3] === 'takeaway'

  if (!isPublic && !isTakeaway) return null

  if (loading || !show || !promo) return null

  return (
    <PromoModal
      open={show}
      onClose={dismiss}
      tenantName={tenantName || undefined}
      tenantLogo={tenantLogo || undefined}
      accentColor={accentColor}
    >
      <PromoHeader
        badgeLabel={promo.badgeLabel}
        title={promo.title}
        accentColor={accentColor}
        imageUrl={promo.imageUrl}
      />

      {promo.imageUrl && <PromoImage src={promo.imageUrl} alt={promo.title} />}

      {promo.type === 'discount' && (
        <DiscountContent promo={promo} onContinue={dismiss} accentColor={accentColor} />
      )}

      {promo.type === 'info' && (
        <InfoContent promo={promo} onContinue={dismiss} accentColor={accentColor} />
      )}

      {promo.type === 'loyalty' && (
        <LoyaltyContent
          promo={promo}
          loyaltyMsg={loyaltyMsg}
          tenantSlug={tenantSlug}
          onClose={dismiss}
          accentColor={accentColor}
        />
      )}

      <button
        onClick={dismiss}
        className="text-xs font-semibold transition-colors text-center py-3"
        style={{ color: 'var(--tgo-text-muted, #A09A95)' }}
      >
        Seguir navegando
      </button>

      {promo.termsText && (
        <p className="text-[10px] text-center leading-relaxed px-6 pb-6" style={{ color: 'var(--tgo-text-muted, #A09A95)', opacity: 0.7 }}>
          {promo.termsText}
        </p>
      )}
    </PromoModal>
  )
}
