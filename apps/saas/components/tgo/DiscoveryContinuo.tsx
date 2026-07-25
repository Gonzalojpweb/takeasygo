'use client'

// ── DiscoveryContinuo ─────────────────────────────────────────────────────────
//
// Wrapper que anima la inserción de nuevos items en una lista.
//
// Responsabilidades:
//   1. Detectar nuevos items al final de la lista
//   2. Animar entrada del nuevo item (fade + slide up)
//   3. Mantener estabilidad de items existentes (no re-animar)
//
// Dependencias:
//   - framer-motion (AnimatePresence + motion)
//
// Uso:
//   <DiscoveryContinuo items={restaurants} keyExtractor={r => r.id}>
//     {(item) => <RestaurantCard restaurant={item} />}
//   </DiscoveryContinuo>

import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DiscoveryContinuoProps<T> {
  /** Array de items a renderizar */
  items: T[]
  /** Función para extraer la key única de cada item */
  keyExtractor: (item: T) => string
  /** Render function para cada item */
  children: (item: T, index: number) => React.ReactNode
  /** Clase CSS del contenedor */
  className?: string
  /** Estilos del contenedor */
  style?: React.CSSProperties
  /** Gap entre items en px. Default: 12 */
  gap?: number
}

// ── Animación ─────────────────────────────────────────────────────────────────

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
      delay: i * 0.04,
    },
  }),
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15 },
  },
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function DiscoveryContinuo<T>({
  items,
  keyExtractor,
  children,
  className,
  style,
  gap = 12,
}: DiscoveryContinuoProps<T>) {
  const prevCountRef = useRef(items.length)
  const prevKeysRef = useRef(new Set(items.map(keyExtractor)))

  useEffect(() => {
    prevCountRef.current = items.length
    prevKeysRef.current = new Set(items.map(keyExtractor))
  }, [items, keyExtractor])

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap,
        ...style,
      }}
    >
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => {
          const key = keyExtractor(item)
          return (
            <motion.div
              key={key}
              custom={index}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout
            >
              {children(item, index)}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
