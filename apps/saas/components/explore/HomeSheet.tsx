'use client'

// ── HomeSheet ────────────────────────────────────────────────────────────────
//
// Bottom sheet de 3 posiciones para la nueva Home.
// Patrón Uber/Google Maps: peek / half / full.
// Nivel 4 de feedback: decisión sin sacar de contexto, se cierra con swipe.
//
// Paso 2 del spec: sheet funcional con data dummy de 4-6 picks.

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { useHaptic } from '@/components/tgo/useHaptic'
import PuntoTGO, { type NetworkStatus } from '@/components/tgo/PuntoTGO'
import Image from 'next/image'
import { Clock, MapPin, ChevronRight } from 'lucide-react'

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

// ── Sheet positions (in px from bottom, excluding bottom nav ~64px) ────────

const PEEK = 80    // Handle + minimal preview
const HALF = 340   // Half screen-ish: shows 4-6 items
const FULL_RATIO = 0.88 // 88% of viewport height for full

// ── Snap thresholds ───────────────────────────────────────────────────────

function snapTo(y: number, maxH: number) {
  const fullH = maxH * FULL_RATIO
  const mid = (PEEK + HALF) / 2
  const mid2 = (HALF + fullH) / 2
  if (y < mid) return PEEK
  if (y < mid2) return HALF
  return fullH
}

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
  const networkStatus: NetworkStatus = isNetwork
    ? r.isOperational === false
      ? 'dormant'
      : 'live'
    : 'dormant'

  return (
    <button
      onClick={() => { haptic.impact('light'); onSelect() }}
      className="flex items-center gap-3 w-full text-left py-3 px-4 active:scale-[0.98] transition-transform"
      style={{ borderBottom: '1px solid var(--tgo-border)' }}
    >
      <PuntoTGO
        variant="avatar"
        size="md"
        networkStatus={networkStatus}
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

export default function HomeSheet({
  userLat,
  userLng,
  restaurants,
  onSelect,
  children,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetH, setSheetH] = useState(0)
  const [position, setPosition] = useState<'peek' | 'half' | 'full'>('peek')
  const y = useMotionValue(PEEK)
  const haptic = useHaptic()

  // Measure viewport
  useEffect(() => {
    const update = () => {
      setSheetH(window.innerHeight)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const fullH = sheetH * FULL_RATIO

  // Drag constraints
  const dragMin = PEEK
  const dragMax = fullH

  // Transform y to visual offset
  const sheetY = useTransform(y, [PEEK, fullH], [PEEK, fullH])

  // Snap on drag end
  const handleDragEnd = useCallback(() => {
    const current = y.get()
    const snapped = snapTo(current, sheetH)
    animate(y, snapped, {
      type: 'spring',
      stiffness: 400,
      damping: 35,
    })
    if (snapped === PEEK) setPosition('peek')
    else if (snapped === HALF) setPosition('half')
    else setPosition('full')
  }, [y, sheetH])

  // Programmatic snap
  const snapToPosition = useCallback((pos: 'peek' | 'half' | 'full') => {
    const target = pos === 'peek' ? PEEK : pos === 'half' ? HALF : fullH
    animate(y, target, {
      type: 'spring',
      stiffness: 400,
      damping: 35,
    })
    setPosition(pos)
  }, [y, fullH])

  // Top picks: 4-6 items sorted by proximity
  const topPicks = restaurants
    .filter(r => r.lat !== null && r.lng !== null)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, 6)

  // All valid restaurants for full view
  const allValid = restaurants.filter(r => r.lat !== null && r.lng !== null)

  if (sheetH === 0) return null

  return (
    <motion.div
      ref={sheetRef}
      className="absolute inset-x-0 bottom-0 z-30"
      style={{
        y: sheetY,
        height: fullH,
        touchAction: 'none',
      }}
      drag="y"
      dragConstraints={{ top: dragMin, bottom: dragMax }}
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
              style={{
                borderBottom: '1px solid var(--tgo-border)',
              }}
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

            {/* ── FULL: All restaurants (infinite scroll) ────────────── */}
            {position === 'full' && allValid.length > topPicks.length && (
              <>
                <div
                  className="px-4 py-2"
                  style={{
                    borderTop: '1px solid var(--tgo-border)',
                    borderBottom: '1px solid var(--tgo-border)',
                  }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--tgo-text-muted)' }}
                  >
                    Todas las opciones
                  </p>
                </div>
                {allValid.slice(6).map((r) => (
                  <SheetItem
                    key={r.id}
                    r={r}
                    onSelect={() => onSelect(r)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
