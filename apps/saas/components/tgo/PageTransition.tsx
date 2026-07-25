'use client'

// ── PageTransition ────────────────────────────────────────────────────────────
//
// Wrapper para transiciones de navegación entre pantallas.
//
// Responsabilidades:
//   1. Animar entrada de la página (fade + slide up)
//   2. Animar salida al navegar hacia atrás (fade + slide down)
//   3. Mantener transiciones consistentes con el Motion Language de TGO
//
// Reglas de TGO Sprint 4:
//   - Nada rebota
//   - Nada gira
//   - Todo aparece con suavidad
//   - Todo desaparece con naturalidad
//   - Duraciones: 180-220ms
//
// Dependencias:
//   - framer-motion
//
// Uso:
//   <PageTransition>
//     <div>Contenido de la página</div>
//   </PageTransition>
//
//   // Con variante personalizada:
//   <PageTransition variant="modal">
//     <div>Contenido del modal</div>
//   </PageTransition>

import { motion, type TargetAndTransition, type Transition } from 'framer-motion'

type TransitionVariant = 'page' | 'modal' | 'sheet' | 'none'

interface PageTransitionProps {
  children: React.ReactNode
  /** Variante de transición. Default: "page" */
  variant?: TransitionVariant
  /** Clase CSS */
  className?: string
  /** Estilos */
  style?: React.CSSProperties
}

// ── Configuración de variantes ────────────────────────────────────────────────

const TRANSITIONS: Record<TransitionVariant, {
  initial: TargetAndTransition
  animate: TargetAndTransition
  exit: TargetAndTransition
  transition: Transition
}> = {
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
    transition: {
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
  modal: {
    initial: { opacity: 0, scale: 0.96, y: 4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 2 },
    transition: {
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
  sheet: {
    initial: { opacity: 0, y: '100%' },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: '100%' },
    transition: {
      duration: 0.22,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
  none: {
    initial: {},
    animate: {},
    exit: {},
    transition: { duration: 0 },
  },
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function PageTransition({
  children,
  variant = 'page',
  className,
  style,
}: PageTransitionProps) {
  const config = TRANSITIONS[variant]

  return (
    <motion.div
      initial={config.initial}
      animate={config.animate}
      exit={config.exit}
      transition={config.transition}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}
