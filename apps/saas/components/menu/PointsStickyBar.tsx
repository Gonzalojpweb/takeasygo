'use client'

import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useStoreItems } from '@/hooks/useStoreItems'
import { computeClubProgress, formatPoints } from '@/lib/club-progress'
import { isLightColor } from '@/lib/color-utils'
import { ClubCoin } from '@/components/menu/club/ClubCoins'

interface Props {
  tenantSlug: string
  memberPoints: number
  locationId?: string
  /** La Tarjeta del Club ya quedó arriba: recién ahí se muestra la barra. */
  visible: boolean
  /** Header fijo del menú: la barra se apoya justo debajo. */
  anchorRef: RefObject<HTMLElement | null>
  primary: string
  bg: string
  text: string
  zIndex?: number
}

/**
 * Recordatorio compacto del saldo. Flota debajo del header (position: fixed)
 * para no correr el contenido al aparecer, y solo después de pasar la Tarjeta
 * del Club: así el saldo nunca se ve dos veces en pantalla.
 */
export default function PointsStickyBar({ tenantSlug, memberPoints, locationId, visible, anchorRef, primary, bg, text, zIndex = 30 }: Props) {
  const router = useRouter()
  const { items, loading } = useStoreItems(tenantSlug)
  const [top, setTop] = useState(0)

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const update = () => setTop(Math.max(0, el.getBoundingClientRect().bottom))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update)
    }
  }, [anchorRef])

  const progress = useMemo(() => computeClubProgress(memberPoints, items), [memberPoints, items])
  const storeUrl = `/app/profile/club/${tenantSlug}?tab=store&origin=menu${locationId ? `&locationId=${locationId}` : ''}`

  if (loading || items.length === 0 || memberPoints <= 0) return null

  const label = progress.next
    ? `Te faltan ${formatPoints(progress.missing)} pts para ${progress.next.name}`
    : '¡Canjeá tus puntos!'
  const fg = /^#[0-9a-f]{3,8}$/i.test(text || '') ? text : '#1A1A1A'
  const ground = /^#[0-9a-f]{3,8}$/i.test(bg || '') ? bg : '#FFFFFF'

  return (
    <div
      aria-hidden={!visible}
      className="fixed inset-x-0 border-b backdrop-blur-md transition-transform duration-300 motion-reduce:transition-none"
      style={{
        top,
        zIndex,
        transform: visible ? 'translateY(0)' : 'translateY(-110%)',
        pointerEvents: visible ? 'auto' : 'none',
        visibility: visible ? 'visible' : 'hidden',
        transitionProperty: 'transform, visibility',
        backgroundColor: `color-mix(in oklab, ${ground} 88%, transparent)`,
        borderColor: `color-mix(in oklab, ${fg} 10%, transparent)`,
        '--club-brand': primary,
        '--club-deep': `color-mix(in oklab, ${primary} 62%, #2a0010)`,
        '--club-glow': `color-mix(in oklab, ${primary} 55%, #FFD43B)`,
      } as CSSProperties}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
        <button
          type="button"
          tabIndex={visible ? 0 : -1}
          onClick={() => router.push(storeUrl)}
          className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-extrabold tabular-nums transition-transform active:scale-95"
          style={{
            background: `color-mix(in oklab, ${primary} 14%, ${isLightColor(ground) ? '#FFFFFF' : ground})`,
            color: 'var(--club-deep)',
          }}
        >
          <ClubCoin className="w-[18px]" />
          {formatPoints(memberPoints)} pts
          <ChevronRight size={12} className="opacity-50" />
        </button>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${primary} 15%, transparent)` }}>
            <i
              className="block h-full rounded-full transition-[width] duration-700"
              style={{ width: `${progress.pct}%`, background: 'linear-gradient(90deg, var(--club-deep), var(--club-brand), var(--club-glow))' }}
            />
          </div>
          <small className="truncate text-[11px] font-medium" style={{ color: `color-mix(in oklab, ${fg} 62%, transparent)` }}>
            {label}
          </small>
        </div>
      </div>
    </div>
  )
}
