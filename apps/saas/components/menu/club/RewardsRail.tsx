'use client'

import Image from 'next/image'
import { cloudinaryUrl, cloudinaryBlurUrl } from '@/lib/utils'
import { formatPoints } from '@/lib/club-progress'
import { ShineBorder } from '@/components/ui/shine-border'
import type { PublicStoreItem } from '@/hooks/useStoreItems'

export type RailMode = 'identify' | 'member' | 'browse'

interface Props {
  items: PublicStoreItem[]
  mode: RailMode
  /** Canje desde el menú habilitado (solo aplica a `member`). */
  rewardEnabled: boolean
  /** Saldo menos lo ya comprometido en el carrito. */
  pointsAvailable: number
  limitReached: boolean
  cartRewardIds: string[]
  onAdd?: (item: PublicStoreItem) => void
  /** Toca un premio o "Ver premio": abre la tienda del club. */
  onOpenStore: () => void
  /** "Identificate": lleva el foco al celular. */
  onIdentify: () => void
}

const btnBase = 'w-full rounded-xl px-1.5 py-2 text-xs font-bold transition-transform active:scale-[0.97]'

export function RewardsRail({ items, mode, rewardEnabled, pointsAvailable, limitReached, cartRewardIds, onAdd, onOpenStore, onIdentify }: Props) {
  return (
    <div className="-mx-[18px] -mb-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[18px] pb-1 pt-1.5 scrollbar-hide">
      {items.map(item => {
        const inCart = cartRewardIds.includes(item._id)
        const lacks = pointsAvailable < item.pointsCost
        const canAdd = mode === 'member' && rewardEnabled && Boolean(onAdd) && !inCart && !limitReached && !lacks
        // "Disponible" también cuando el canje en el menú está apagado: el saldo alcanza.
        const reachable = mode === 'member' && !inCart && !lacks && (!rewardEnabled || !limitReached)

        let action: React.ReactNode
        if (mode === 'identify') {
          action = <button type="button" onClick={onIdentify} className={btnBase} style={{ background: 'var(--club-soft)', color: 'var(--club-deep)' }}>Identificate</button>
        } else if (mode === 'browse' || !rewardEnabled) {
          action = <button type="button" onClick={onOpenStore} className={btnBase} style={{ background: 'var(--club-soft)', color: 'var(--club-deep)' }}>Ver premio</button>
        } else if (inCart) {
          action = (
            <div aria-label={`${item.name} en el pedido`} className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-center text-xs font-bold text-emerald-700">
              ✓ En el pedido
            </div>
          )
        } else if (canAdd) {
          action = (
            <button
              type="button"
              onClick={() => onAdd?.(item)}
              aria-label={`Agregar ${item.name} al pedido`}
              className={btnBase}
              style={{ background: 'var(--club-brand)', color: 'var(--club-on-brand)' }}
            >
              Agregar · {formatPoints(item.pointsCost)} pts
            </button>
          )
        } else {
          action = (
            <button type="button" disabled className={`${btnBase} cursor-default`} style={{ background: 'var(--club-chip)', color: 'var(--club-muted)' }}>
              {limitReached ? 'Máximo alcanzado' : `Faltan ${formatPoints(item.pointsCost - pointsAvailable)} pts`}
            </button>
          )
        }

        return (
          <div key={item._id} className="grid w-[132px] shrink-0 snap-start content-start gap-2">
            <button type="button" onClick={onOpenStore} className="relative block rounded-[18px] p-0.5 text-left" aria-label={`Ver ${item.name} en la tienda del club`}>
              {reachable && (
                <ShineBorder borderWidth={2} duration={5} shineColor={['var(--club-glow)', 'var(--club-brand)', '#FFE8A3']} />
              )}
              <div className="relative h-28 overflow-hidden rounded-2xl" style={{ background: 'var(--club-soft)' }}>
                {item.imageUrl ? (
                  <Image
                    src={cloudinaryUrl(item.imageUrl, { w: 300 })}
                    alt={item.name}
                    fill
                    sizes="132px"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={cloudinaryBlurUrl(item.imageUrl)}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-4xl" aria-hidden="true">🎁</div>
                )}
                <span
                  className="absolute bottom-[7px] left-[7px] z-10 rounded-full px-2 py-[3px] text-[11.5px] font-extrabold tabular-nums backdrop-blur-md"
                  style={{ background: 'color-mix(in oklab, var(--club-card) 88%, transparent)', color: 'var(--club-fg)' }}
                >
                  {formatPoints(item.pointsCost)} pts
                </span>
                {reachable && (
                  <span
                    className="absolute right-[7px] top-[7px] z-10 rounded-full px-[7px] py-[3px] text-[10px] font-extrabold uppercase tracking-wide"
                    style={{ background: 'var(--club-brand)', color: 'var(--club-on-brand)' }}
                  >
                    Disponible
                  </span>
                )}
              </div>
            </button>
            <p className="line-clamp-2 min-h-[33px] text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--club-fg)' }}>
              {item.name}
            </p>
            {action}
          </div>
        )
      })}
    </div>
  )
}
