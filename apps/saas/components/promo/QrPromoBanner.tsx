'use client'

import { usePathname } from 'next/navigation'
import { Info } from 'lucide-react'
import { useQrPromo } from '@/hooks/useQrPromo'
import { qrPromoMenuPath } from '@/lib/menu/location-ref'
import { PromoModal } from './PromoModal'
import { PromoHero } from './PromoHero'
import { PromoText } from './PromoText'
import { PromoFooter } from './PromoFooter'
import { LoyaltyContent } from './LoyaltyContent'

// ─── Aviso de promoción al entrar a la carta ─────────────────────────────────
// Hoja nativa: imagen completa (una sola vez) → etiqueta, título y descripción
// → pie fijo con el botón principal, «Seguir navegando» y las condiciones.
// Tipos: descuento (insignia «X% OFF» + aviso de canal), info y club.

interface QrPromoBannerProps {
  tenantSlug: string
}

export function QrPromoBanner({ tenantSlug }: QrPromoBannerProps) {
  const pathname = usePathname()
  const { promo, loading, show, loyaltyMsg, accentColor, tenantLogo, tenantName, dismiss } = useQrPromo(tenantSlug)

  // Link general del comercio, página de la sede o menú para llevar/delivery.
  if (!qrPromoMenuPath(pathname ?? '').show) return null

  if (loading || !show || !promo) return null

  const isDiscount = promo.type === 'discount'
  const isLoyalty = promo.type === 'loyalty'
  const description = promo.subtitle ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`) : ''

  return (
    <PromoModal
      open={show}
      onClose={dismiss}
      tenantName={tenantName || undefined}
      tenantLogo={tenantLogo || undefined}
      accentColor={accentColor}
      footer={
        <PromoFooter
          primaryLabel={isLoyalty ? undefined : promo.buttonText}
          onPrimary={isLoyalty ? undefined : dismiss}
          onSecondary={dismiss}
          terms={promo.termsText || undefined}
          accentColor={accentColor}
        />
      }
    >
      <PromoHero
        imageUrl={promo.imageUrl}
        alt={promo.title}
        accentColor={accentColor}
        tenantLogo={tenantLogo || undefined}
        badge={isDiscount && promo.discountPercentage > 0 ? `${promo.discountPercentage}% OFF` : null}
      />

      <PromoText
        eyebrow={promo.badgeLabel}
        title={promo.title}
        description={isLoyalty ? undefined : description}
        accentColor={accentColor}
      />

      {isDiscount && (
        <div
          className="mt-4 flex items-start gap-2.5 rounded-2xl p-3"
          style={{ backgroundColor: 'var(--tgo-surface-1, #F7F5F2)' }}
        >
          <Info size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--tgo-text-secondary, #6B6560)' }} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--tgo-text-primary, #1A1A1A)' }}>
              {promo.takeawayWarningTitle || 'Exclusivo para takeaway'}
            </p>
            <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--tgo-text-secondary, #6B6560)' }}>
              {promo.takeawayWarningText || 'Válido solo para pedidos para llevar.'}
            </p>
          </div>
        </div>
      )}

      {isLoyalty && (
        <LoyaltyContent
          promo={promo}
          loyaltyMsg={loyaltyMsg}
          tenantSlug={tenantSlug}
          onClose={dismiss}
          accentColor={accentColor}
        />
      )}
    </PromoModal>
  )
}
