'use client'

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
  const { promo, loading, show, loyaltyMsg, dismiss } = useQrPromo(tenantSlug)

  if (loading || !show || !promo) return null

  return (
    <PromoModal open={show} onClose={dismiss}>
      <PromoHeader
        badgeLabel={promo.badgeLabel}
        title={promo.title}
      />

      {promo.imageUrl && <PromoImage src={promo.imageUrl} alt={promo.title} />}

      {promo.type === 'discount' && (
        <DiscountContent promo={promo} onContinue={dismiss} />
      )}

      {promo.type === 'info' && (
        <InfoContent promo={promo} onContinue={dismiss} />
      )}

      {promo.type === 'loyalty' && (
        <LoyaltyContent
          promo={promo}
          loyaltyMsg={loyaltyMsg}
          tenantSlug={tenantSlug}
          onClose={dismiss}
        />
      )}

      <button
        onClick={dismiss}
        className="text-xs font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors text-center py-3"
      >
        Seguir navegando
      </button>

      {promo.termsText && (
        <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed px-6 pb-6">
          {promo.termsText}
        </p>
      )}
    </PromoModal>
  )
}
