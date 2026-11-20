'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { CartItem } from '@/types/cart'
import {
  SALES_CHANNEL_INFO,
  channelMismatchMessage,
  isOfferedInMode,
  type SalesChannel,
} from '@/lib/sales-channels'

// ============================================================================
// Aviso del checkout: promo o combo que no vale en la modalidad elegida
// ============================================================================
// 20/11/2026. Ej.: «La promoción "2x1 Pizzas" es solo para delivery» con
// botones [🛵 Cambiar a Delivery] [Quitar]. Se avisa ANTES de pagar; el
// server igual lo rechaza (POST /orders, code OFFER_CHANNEL).
// ============================================================================

type OfferInfo = { title: string; channels: SalesChannel[] }

export interface OfferChannelConflict {
  key: string
  kind: 'promo' | 'combo'
  title: string
  channels: SalesChannel[]
  cartItemIds: string[]
}

/** Canales de las promos/combos del carrito y los que chocan con `mode`. */
export function useOfferChannelConflicts(
  tenantSlug: string,
  locationId: string,
  cart: CartItem[],
  mode: string
): OfferChannelConflict[] {
  const promotionIds = useMemo(
    () => [...new Set(cart.filter((i) => i.type === 'promotion' && i.promotionId).map((i) => i.promotionId!))].sort(),
    [cart]
  )
  const comboIds = useMemo(
    () => [...new Set(cart.filter((i) => i.type === 'combo' && i.comboId).map((i) => i.comboId!))].sort(),
    [cart]
  )
  const query = `promotionIds=${promotionIds.join(',')}&comboIds=${comboIds.join(',')}`
  const [info, setInfo] = useState<{ promotions: Record<string, OfferInfo>; combos: Record<string, OfferInfo> }>({ promotions: {}, combos: {} })

  useEffect(() => {
    if (!locationId || (promotionIds.length === 0 && comboIds.length === 0)) return
    let alive = true
    fetch(`/api/${tenantSlug}/menu/${locationId}/offer-channels?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setInfo({ promotions: data.promotions ?? {}, combos: data.combos ?? {} })
      })
      .catch(() => {
        /* sin red: el server igual valida al pagar */
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, locationId, query])

  return useMemo(() => {
    const out = new Map<string, OfferChannelConflict>()
    for (const item of cart) {
      const isPromo = item.type === 'promotion' && item.promotionId
      const isCombo = item.type === 'combo' && item.comboId
      if (!isPromo && !isCombo) continue
      const id = (isPromo ? item.promotionId : item.comboId)!
      const offer = isPromo ? info.promotions[id] : info.combos[id]
      if (!offer || isOfferedInMode(offer.channels, mode)) continue
      const key = `${isPromo ? 'p' : 'c'}:${id}`
      const current = out.get(key)
      if (current) current.cartItemIds.push(item.cartItemId)
      else out.set(key, { key, kind: isPromo ? 'promo' : 'combo', title: offer.title, channels: offer.channels, cartItemIds: [item.cartItemId] })
    }
    return [...out.values()]
  }, [cart, info, mode])
}

interface Props {
  conflicts: OfferChannelConflict[]
  /** Canales a los que el cliente puede cambiar desde este checkout. */
  switchable: SalesChannel[]
  onSwitch: (channel: SalesChannel) => void
  onRemove: (cartItemIds: string[]) => void
}

export default function OfferChannelNotice({ conflicts, switchable, onSwitch, onRemove }: Props) {
  if (conflicts.length === 0) return null
  return (
    <div className="mb-6 space-y-2" role="alert" aria-live="polite">
      {conflicts.map((c) => {
        const targets = c.channels.filter((ch) => switchable.includes(ch))
        const onlyInSalon = targets.length === 0 && c.channels.includes('dine-in')
        return (
          <div key={c.key} className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">{channelMismatchMessage(c.kind, c.title, c.channels)}</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {targets.length > 0
                    ? 'Cambiá la modalidad para mantenerla o quitala del pedido.'
                    : onlyInSalon
                      ? 'Se pide desde el QR de las mesas del local. Quitala para seguir con tu pedido.'
                      : 'Quitala para seguir con tu pedido.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {targets.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onSwitch(ch)}
                      className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-700"
                    >
                      {SALES_CHANNEL_INFO[ch].emoji} Cambiar a {SALES_CHANNEL_INFO[ch].label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onRemove(c.cartItemIds)}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                  >
                    Quitar {c.kind === 'combo' ? 'el combo' : 'la promo'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
