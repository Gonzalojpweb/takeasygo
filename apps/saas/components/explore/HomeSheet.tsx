'use client'

// ── HomeSheet ────────────────────────────────────────────────────────────────
//
// Bottom sheet de 3 posiciones para la nueva Home.
// Patrón Uber/Google Maps: peek / half / full.
// Nivel 4 de feedback: decisión sin sacar de contexto, se cierra con swipe.
//
// Posicionamiento: sheet anclado a bottom:0, translateY para ocultar.
// y = 0 → full visible. y = fullH → todo oculto. PEEK = solo handle visible.

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { useHaptic } from '@/components/tgo/useHaptic'
import PuntoTGO, { type LcsFaceExpression } from '@/components/tgo/PuntoTGO'
import { Clock } from 'lucide-react'

interface Props {
  userLat: number
  userLng: number
  restaurants: RestaurantCardData[]
  onSelect: (r: RestaurantCardData) => void
  children?: React.ReactNode
}

function distLabel(m: number | null) {
  if (m === null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

// ── Sheet positions ───────────────────────────────────────────────────────
// PEEK = handle + "ciudad ahora mismo" (~80px visible from bottom)
// HALF = 4-6 picks (~340px visible from bottom)
// FULL = 88% of viewport

const PEEK_VISIBLE = 80
const HALF_VISIBLE = 340
const FULL_RATIO = 0.88

// ── Single restaurant row ──────────────────────────────────────────────────

function SheetItem({
  r,
  onSelect,
}: {
  r: RestaurantCardData
  onSelect: () => void
}) {
  const haptic = useHaptic()
  const isNetwork = r.type === 'network'
  const isOperational = r.isOperational ?? true
  const isClosed = r.isOpenNow === false
  const hasWink = r.hasWinkOffer === true || r.loyaltyInfo?.hasActivePromo === true
  const isResting = isClosed || !isOperational || !r.acceptsOrders || !isNetwork
  const expression = isResting ? 'sleepy' : (hasWink ? 'wink' : 'happy')

  return (
    <button
      onClick={() => { haptic.impact('light'); onSelect() }}
      className="flex items-center gap-3 w-full text-left py-3 px-4 active:scale-[0.98] transition-transform"
      style={{ borderBottom: '1px solid var(--tgo-border)' }}
    >
      <PuntoTGO
        expression={expression}
        ring={r.icoRing ?? 'none'}
        hasCrown={r.hasCrown ?? false}
        isNew={r.isNew ?? false}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded-full"
            style={{
              backgroundColor: isNetwork
                ? (r.isOperational === false ? 'var(--tgo-state-discovery-soft)' : 'var(--tgo-brand-primary-soft)')
                : 'var(--tgo-state-inactive-soft)',
              color: isNetwork
                ? (r.isOperational === false ? 'var(--tgo-state-discovery)' : 'var(--tgo-brand-primary)')
                : 'var(--tgo-state-inactive)',
            }}
          >
            {isNetwork
              ? (r.isOperational === false ? 'Catálogo' : 'En Red')
              : 'Directorio'}
          </span>
        </div>
        <p
          className="text-sm font-bold truncate mt-0.5"
          style={{ color: 'var(--tgo-text-primary)' }}
        >
          {r.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-[11px] truncate"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            {r.address}
          </span>
          {r.distanceM !== null && (
            <>
              <span style={{ color: 'var(--tgo-border)' }}>·</span>
              <span
                className="text-[11px] font-medium shrink-0"
                style={{ color: 'var(--tgo-text-secondary)' }}
              >
                {distLabel(r.distanceM)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {r.isOpenNow === true && (
          <div className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'var(--tgo-state-success)' }}
            />
            <span
              className="text-[10px] font-semibold"
              style={{ color: 'var(--tgo-state-success)' }}
            >
              Abierto
            </span>
          </div>
        )}
        {r.estimatedPickupTime > 0 && (
          <div className="flex items-center gap-1">
            <Clock size={10} style={{ color: 'var(--tgo-text-muted)' }} />
            <span
              className="text-[10px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              ~{r.estimatedPickupTime}min
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

// ── Main Sheet Component ───────────────────────────────────────────────────

export interface HomeSheetHandle {
  snapTo: (pos: 'peek' | 'half' | 'full') => void
}

const HomeSheet = forwardRef<HomeSheetHandle, Props>(function HomeSheet(
  { userLat, userLng, restaurants, onSelect, children },
  ref,
) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetH, setSheetH] = useState(0)
  const [position, setPosition] = useState<'peek' | 'half' | 'full'>('peek')
  const haptic = useHaptic()

  // y = pixels HIDDEN below viewport. 0 = fully visible, fullH = fully hidden.
  const y = useMotionValue(0)

  // Measure viewport
  useEffect(() => {
    const update = () => setSheetH(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const fullH = sheetH * FULL_RATIO

  // Snap targets as "hidden" values
  const peekHidden = fullH - PEEK_VISIBLE
  const halfHidden = fullH - HALF_VISIBLE
  const fullHidden = 0

  // Initialize to peek position
  useEffect(() => {
    if (fullH > 0) {
      y.set(peekHidden)
    }
  }, [fullH, peekHidden, y])

  // Snap on drag end
  const handleDragEnd = useCallback(() => {
    const current = y.get()
    // Determine closest snap target
    const targets = [fullHidden, halfHidden, peekHidden]
    let snapped = peekHidden
    let minDist = Infinity
    for (const t of targets) {
      const dist = Math.abs(current - t)
      if (dist < minDist) {
        minDist = dist
        snapped = t
      }
    }
    animate(y, snapped, {
      type: 'spring',
      stiffness: 400,
      damping: 35,
    })
    if (snapped === peekHidden) setPosition('peek')
    else if (snapped === halfHidden) setPosition('half')
    else setPosition('full')
  }, [y, peekHidden, halfHidden, fullHidden])

  // Programmatic snap
  const snapToPosition = useCallback((pos: 'peek' | 'half' | 'full') => {
    const target = pos === 'peek' ? peekHidden : pos === 'half' ? halfHidden : fullHidden
    animate(y, target, {
      type: 'spring',
      stiffness: 400,
      damping: 35,
    })
    setPosition(pos)
  }, [y, peekHidden, halfHidden, fullHidden])

  // Expose snapTo to parent via ref
  useImperativeHandle(ref, () => ({ snapTo: snapToPosition }), [snapToPosition])

  // Top picks: 4-6 items with v1 personalization
  const topPicks = restaurants
    .filter(r => r.lat !== null && r.lng !== null)
    .sort((a, b) => {
      const aOpen = a.isOpenNow === true ? 0 : 1
      const bOpen = b.isOpenNow === true ? 0 : 1
      if (aOpen !== bOpen) return aOpen - bOpen
      const aNetwork = a.type === 'network' ? 0 : 1
      const bNetwork = b.type === 'network' ? 0 : 1
      if (aNetwork !== bNetwork) return aNetwork - bNetwork
      return (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)
    })
    .slice(0, 6)

  if (sheetH === 0 || fullH === 0) return null

  return (
    <motion.div
      ref={sheetRef}
      className="absolute inset-x-0 bottom-0 z-[999]"
      style={{
        height: fullH,
        y,
        touchAction: 'none',
      }}
      drag="y"
      dragConstraints={{ top: fullHidden, bottom: peekHidden }}
      dragElastic={0.1}
      onDragEnd={handleDragEnd}
    >
      <div
        className="h-full flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--tgo-surface-0)',
          borderRadius: 'var(--tgo-radius-2xl) var(--tgo-radius-2xl) 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* ── Drag Handle ─────────────────────────────────────────────── */}
        <div
          className="flex justify-center py-3 shrink-0 cursor-grab active:cursor-grabbing"
          onClick={() => {
            haptic.selection()
            if (position === 'peek') snapToPosition('half')
            else if (position === 'half') snapToPosition('full')
            else snapToPosition('peek')
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'var(--tgo-border)',
            }}
          />
        </div>

        {/* ── PEEK: City metrics summary ─────────────────────────────── */}
        {children}

        {/* ── HALF: Top picks (4-6 items) ────────────────────────────── */}
        {position !== 'peek' && (
          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
            <div
              className="px-4 py-2"
              style={{ borderBottom: '1px solid var(--tgo-border)' }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--tgo-text-muted)' }}
              >
                Cerca de vos
              </p>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: 'var(--tgo-text-muted)' }}
              >
                {topPicks.length} opciones personalizadas
              </p>
            </div>

            {topPicks.map((r) => (
              <SheetItem
                key={r.id}
                r={r}
                onSelect={() => onSelect(r)}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
})

export default HomeSheet
