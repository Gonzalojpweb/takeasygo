'use client'

// ── CitySheet ───────────────────────────────────────────────────────────────
//
// Panel inferior de tres posiciones (asomado / medio / completo).
// Se arrastra SOLO desde la cabecera, así la lista scrollea normal.
// El mapa manda: en «medio» el panel ocupa menos de la mitad de la pantalla.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { animate, motion, useDragControls, useMotionValue, type PanInfo } from 'framer-motion'

export type SheetSnap = 'peek' | 'half' | 'full'

export interface CitySheetHandle {
  snapTo: (snap: SheetSnap) => void
}

interface Props {
  /** Cabecera siempre visible (pulso de la ciudad). Es la zona de arrastre. */
  header: React.ReactNode
  children: React.ReactNode
  initial: SheetSnap
  hidden: boolean
  /** Alto visible del panel en cada cambio (para correr el centro del mapa). */
  onVisibleHeight: (px: number) => void
  onSnap?: (snap: SheetSnap) => void
}

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 38 }
const DOCK = 84
const HANDLE = 24

const CitySheet = forwardRef<CitySheetHandle, Props>(function CitySheet(
  { header, children, initial, hidden, onVisibleHeight, onSnap },
  ref
) {
  const controls = useDragControls()
  const headerRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(2000)
  const [viewport, setViewport] = useState(0)
  const [headerH, setHeaderH] = useState(150)
  const [snap, setSnap] = useState<SheetSnap>(initial)
  const placed = useRef(false)

  useEffect(() => {
    const update = () => setViewport(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeaderH(el.offsetHeight))
    observer.observe(el)
    setHeaderH(el.offsetHeight)
    return () => observer.disconnect()
  }, [])

  const fullH = Math.round(viewport * 0.9)
  const peekVisible = HANDLE + headerH + DOCK
  const halfVisible = Math.max(peekVisible + 96, Math.round(viewport * 0.46))
  const visibleFor = useCallback(
    (s: SheetSnap) => (s === 'peek' ? peekVisible : s === 'half' ? halfVisible : fullH),
    [peekVisible, halfVisible, fullH]
  )

  const moveTo = useCallback(
    (s: SheetSnap, instant = false) => {
      const target = fullH - visibleFor(s)
      if (instant) y.set(target)
      else animate(y, target, SPRING)
      setSnap(s)
      onSnap?.(s)
    },
    [fullH, visibleFor, y, onSnap]
  )

  // Ubicación inicial y reacomodo cuando cambian las medidas o se oculta.
  useEffect(() => {
    if (viewport === 0) return
    if (hidden) {
      animate(y, fullH + 40, SPRING)
      onVisibleHeight(0)
      return
    }
    const target = fullH - visibleFor(snap)
    if (!placed.current) {
      placed.current = true
      y.set(fullH)
    }
    animate(y, target, SPRING)
    // El mapa nunca corre su centro más allá de la posición media.
    onVisibleHeight(Math.min(visibleFor(snap), halfVisible))
  }, [viewport, hidden, snap, fullH, halfVisible, visibleFor, y, onVisibleHeight])

  useImperativeHandle(ref, () => ({ snapTo: s => moveTo(s) }), [moveTo])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const projected = y.get() + info.velocity.y * 0.18
    const order: SheetSnap[] = ['full', 'half', 'peek']
    let best: SheetSnap = 'peek'
    let bestDistance = Infinity
    for (const s of order) {
      const distance = Math.abs(projected - (fullH - visibleFor(s)))
      if (distance < bestDistance) {
        bestDistance = distance
        best = s
      }
    }
    moveTo(best)
  }

  const cycle = () => moveTo(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')

  if (viewport === 0) return null

  return (
    <motion.div
      className="city-sheet"
      style={{ height: fullH, y }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: fullH - peekVisible }}
      dragElastic={0.06}
      onDragEnd={handleDragEnd}
      aria-hidden={hidden}
    >
      <div
        className="city-sheet__grip"
        onPointerDown={event => controls.start(event)}
      >
        <button
          type="button"
          onClick={cycle}
          aria-label={snap === 'full' ? 'Achicar el panel' : 'Agrandar el panel'}
          style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'none', cursor: 'inherit' }}
        >
          <span className="city-sheet__handle" style={{ display: 'block' }} />
        </button>
        <div ref={headerRef}>{header}</div>
      </div>
      <div className="city-sheet__scroll">{children}</div>
    </motion.div>
  )
})

export default CitySheet
