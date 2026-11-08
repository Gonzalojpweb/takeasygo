'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { BlurFade } from '@/components/ui/blur-fade'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useStoreItems, type PublicStoreItem } from '@/hooks/useStoreItems'
import { computeClubProgress, clubProgressMessage } from '@/lib/club-progress'
import { trackRewardViewed } from '@/lib/track'
import { menuCardTheme } from '@/lib/menu-theme'
import { FloatingCoins, CoinStack } from './ClubCoins'
import { PointsProgress } from './PointsProgress'
import { PhoneIdentify, type IdentifiedMember } from './PhoneIdentify'
import { RewardsRail, type RailMode } from './RewardsRail'

export type { IdentifiedMember }

interface Props {
  tenantSlug: string
  locationId?: string
  /** Nombre del club (tenant.loyalty.clubName); si falta, «Club {local}». */
  clubName: string
  /** Colores del menú (branding) para que la tarjeta tome la marca del local. */
  primary: string
  bg: string
  text: string

  isMember: boolean
  memberName?: string
  memberPoints: number

  /** Club con canje habilitado y todavía sin miembro identificado: muestra el celular. */
  identifyEnabled: boolean
  onMemberIdentified: (member: IdentifiedMember) => void

  /** Agregar premios al carrito desde el menú (canje en checkout + miembro). */
  rewardEnabled: boolean
  /** Saldo menos lo ya comprometido en el carrito. */
  rewardPointsAvailable: number
  rewardLimitReached: boolean
  cartRewardIds: string[]
  onAddReward: (item: PublicStoreItem) => void

  /** La tarjeta quedó arriba, fuera de pantalla: el menú muestra la barra fija de puntos. */
  onPassedChange?: (passed: boolean) => void
}

/**
 * Tarjeta del Club del menú público. Tres estados:
 * - identify: celular para encontrar los puntos (con canje habilitado).
 * - member:   saldo, progreso con hitos por premio y premios para agregar al pedido.
 * - browse:   club sin canje en el menú, o sin miembro: invita y muestra los premios.
 */
export default function ClubPointsCard(props: Props) {
  const {
    tenantSlug, locationId, clubName, primary, bg, text,
    isMember, memberName, memberPoints, identifyEnabled, onMemberIdentified,
    rewardEnabled, rewardPointsAvailable, rewardLimitReached, cartRewardIds, onAddReward,
    onPassedChange,
  } = props
  const router = useRouter()
  const { items, loading } = useStoreItems(tenantSlug)
  const cardRef = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const passedCbRef = useRef(onPassedChange)
  useEffect(() => { passedCbRef.current = onPassedChange }, [onPassedChange])

  const mode: RailMode = identifyEnabled ? 'identify' : isMember ? 'member' : 'browse'
  const progress = useMemo(() => computeClubProgress(memberPoints, items), [memberPoints, items])
  const message = clubProgressMessage(progress)
  const theme = useMemo(() => menuCardTheme(primary, bg, text), [primary, bg, text])
  const storeUrl = `/app/profile/club/${tenantSlug}?tab=store&origin=menu${locationId ? `&locationId=${locationId}` : ''}`
  const hasItems = !loading && items.length > 0

  useEffect(() => {
    if (hasItems) {
      trackRewardViewed({ type: 'store_item', currentPoints: memberPoints, pointsRequired: items[0]?.pointsCost, locationId, tenantSlug })
    }
  }, [hasItems]) // eslint-disable-line react-hooks/exhaustive-deps

  // Avisa cuando la tarjeta quedó arriba (pasada) para mostrar la barra fija.
  // El margen superior descuenta el header fijo del menú.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? 0
        passedCbRef.current?.(!entry.isIntersecting && entry.boundingClientRect.bottom <= top)
      },
      { rootMargin: '-120px 0px 0px 0px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      passedCbRef.current?.(false)
    }
  }, [hasItems])

  if (!hasItems) return null

  return (
    <section className="px-[18px] pb-4 pt-8" style={theme} aria-label={clubName}>
      <h2 className="mb-3 pr-24 text-[21px] font-extrabold tracking-tight" style={{ color: 'var(--club-fg)' }}>
        {clubName}
      </h2>

      <BlurFade inView inViewMargin="-40px">
        <div
          ref={cardRef}
          className="relative rounded-[26px] border-[1.5px] px-[18px] pb-[18px] pt-5"
          style={{
            background: 'var(--club-card)',
            borderColor: 'var(--club-line)',
            boxShadow: '0 14px 30px -18px color-mix(in oklab, var(--club-brand) 55%, transparent)',
          }}
        >
          <FloatingCoins />

          {mode === 'identify' && (
            <>
              <h3 className="max-w-[15ch] text-2xl font-extrabold leading-tight tracking-tight" style={{ color: 'var(--club-fg)' }}>
                Tus puntos te están esperando
              </h3>
              <p className="mb-3.5 mt-1.5 text-[13.5px] leading-snug" style={{ color: 'var(--club-muted)' }}>
                Ingresá tu celular y canjeá premios en este pedido.
              </p>
              <PhoneIdentify ref={phoneRef} tenantSlug={tenantSlug} onIdentified={onMemberIdentified} />
              <div className="mt-2 opacity-80">
                <PointsProgress ghost />
              </div>
            </>
          )}

          {mode === 'member' && (
            <div aria-live="polite">
              {memberName && (
                <p className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--club-muted)' }}>
                  Hola, {memberName.split(' ')[0]}
                </p>
              )}
              <div className="flex items-center gap-2.5">
                <CoinStack className="w-[42px] shrink-0" />
                <span
                  className="text-[46px] font-extrabold leading-none tracking-tight tabular-nums"
                  style={{
                    background: 'linear-gradient(95deg, var(--club-deep), var(--club-brand) 55%, var(--club-glow))',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  <NumberTicker
                    value={memberPoints}
                    locale="es-AR"
                    className="tracking-tight text-transparent dark:text-transparent"
                  />{' '}
                  pts
                </span>
              </div>
              <p className="mb-[18px] mt-3 max-w-[34ch] text-[14.5px] leading-snug" style={{ color: 'var(--club-fg)' }}>
                <b className="font-bold">{message.strong}</b> {message.rest}
              </p>
              <PointsProgress progress={progress} />
            </div>
          )}

          {mode === 'browse' && (
            <>
              <h3 className="max-w-[15ch] text-2xl font-extrabold leading-tight tracking-tight" style={{ color: 'var(--club-fg)' }}>
                Sumá puntos con cada pedido
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: 'var(--club-muted)' }}>
                Canjealos por premios en el local. Mirá lo que podés conseguir.
              </p>
            </>
          )}

          <div className="mb-2.5 mt-5 flex items-baseline justify-between">
            <b className="text-sm" style={{ color: 'var(--club-fg)' }}>Premios</b>
            <button
              type="button"
              onClick={() => router.push(storeUrl)}
              className="flex items-center gap-0.5 text-[13px] font-bold"
              style={{ color: 'var(--club-brand)' }}
            >
              Ver todos <ChevronRight size={15} />
            </button>
          </div>

          <RewardsRail
            items={items}
            mode={mode}
            rewardEnabled={rewardEnabled}
            pointsAvailable={rewardPointsAvailable}
            limitReached={rewardLimitReached}
            cartRewardIds={cartRewardIds}
            onAdd={onAddReward}
            onOpenStore={() => router.push(storeUrl)}
            onIdentify={() => phoneRef.current?.focus()}
          />
        </div>
      </BlurFade>
    </section>
  )
}
