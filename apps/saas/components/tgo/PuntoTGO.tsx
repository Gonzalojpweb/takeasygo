'use client'

// ── PuntoTGO ────────────────────────────────────────────────────────────────
//
// Componente unificado que representa el "Punto TGO" — el personaje visual
// de la marca que aparece en pines de mapa, avatares de tracking, badges, etc.
//
// Referencia: tgoicon.PNG (pin naranja con cara sonriente)
//
// Variantes:
//   - pin: Para mapa — circular con borde, sombra
//   - avatar: Para feed/tracking — circular sin borde
//   - inline: Para badges/counters —最小化, solo cara sin fondo
//
// Estados:
//   - 10 estados de orden (idle, confirmed, preparing, ready, pickup, delivering, arriving, delivered, completed, cancelled)
//   - 2 estados de red (live, dormant)

import { useMemo } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export type PuntoTGOVariant = 'pin' | 'avatar' | 'inline'

export type OrderStatus =
  | 'idle'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'pickup'
  | 'delivering'
  | 'arriving'
  | 'delivered'
  | 'completed'
  | 'cancelled'

export type NetworkStatus = 'live' | 'dormant'

export type Expression = 'happy' | 'neutral' | 'sleepy' | 'excited' | 'worried' | 'sad' | 'focused'

export type PuntoTGOSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface PuntoTGOProps {
  variant?: PuntoTGOVariant
  status?: OrderStatus
  networkStatus?: NetworkStatus
  size?: PuntoTGOSize
  expression?: Expression
  animate?: boolean
  onClick?: () => void
  className?: string
}

// ── Size mapping ────────────────────────────────────────────────────────────

const SIZE_MAP: Record<PuntoTGOSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
}

// ── Expression by status ────────────────────────────────────────────────────

const STATUS_EXPRESSION: Record<OrderStatus, Expression> = {
  idle: 'neutral',
  confirmed: 'happy',
  preparing: 'focused',
  ready: 'excited',
  pickup: 'focused',
  delivering: 'focused',
  arriving: 'excited',
  delivered: 'happy',
  completed: 'sleepy',
  cancelled: 'sad',
}

const NETWORK_EXPRESSION: Record<NetworkStatus, Expression> = {
  live: 'happy',
  dormant: 'sleepy',
}

// ── Color by status ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<OrderStatus, string> = {
  idle: 'var(--tgo-surface-1)',
  confirmed: 'var(--tgo-brand)',
  preparing: 'var(--tgo-brand)',
  ready: 'var(--tgo-success)',
  pickup: 'var(--tgo-brand)',
  delivering: 'var(--tgo-brand)',
  arriving: 'var(--tgo-success)',
  delivered: 'var(--tgo-success)',
  completed: 'var(--tgo-surface-1)',
  cancelled: 'var(--tgo-danger)',
}

const NETWORK_COLORS: Record<NetworkStatus, string> = {
  live: 'var(--tgo-network-live)',
  dormant: 'var(--tgo-network-dormant)',
}

// ── Animation by status ─────────────────────────────────────────────────────

type AnimationType = 'none' | 'pulse' | 'bounce' | 'wiggle'

const STATUS_ANIMATION: Record<OrderStatus, AnimationType> = {
  idle: 'none',
  confirmed: 'none',
  preparing: 'pulse',
  ready: 'bounce',
  pickup: 'pulse',
  delivering: 'pulse',
  arriving: 'bounce',
  delivered: 'bounce',
  completed: 'none',
  cancelled: 'none',
}

// ── Face expressions ────────────────────────────────────────────────────────

function FaceExpression({ expression, size }: { expression: Expression; size: number }) {
  const scale = size / 40 // Scale relative to base size
  const eyeRadius = 1.8 * scale
  const eyeY = 16 * scale
  const eyeSpacing = 5 * scale

  // Mouth varies by expression
  const mouthY = 21 * scale
  const mouthWidth = 6 * scale

  let mouthPath: string
  let eyeLY = eyeY
  let eyeRY = eyeY

  switch (expression) {
    case 'happy':
      // Smile
      mouthPath = `M${-mouthWidth / 2} ${mouthY} Q0 ${mouthY + 4 * scale} ${mouthWidth / 2} ${mouthY}`
      break
    case 'excited':
      // Big smile
      mouthPath = `M${-mouthWidth / 2} ${mouthY} Q0 ${mouthY + 6 * scale} ${mouthWidth / 2} ${mouthY}`
      eyeLY = eyeY - 1 * scale
      eyeRY = eyeY - 1 * scale
      break
    case 'focused':
      // Neutral straight line
      mouthPath = `M${-mouthWidth / 2} ${mouthY} L${mouthWidth / 2} ${mouthY}`
      break
    case 'sleepy':
      // Slight frown
      mouthPath = `M${-mouthWidth / 2} ${mouthY + 2 * scale} Q0 ${mouthY - 1 * scale} ${mouthWidth / 2} ${mouthY + 2 * scale}`
      eyeLY = eyeY + 1 * scale
      eyeRY = eyeY + 1 * scale
      break
    case 'worried':
      // Wavy mouth
      mouthPath = `M${-mouthWidth / 2} ${mouthY} Q${-mouthWidth / 4} ${mouthY + 2 * scale} 0 ${mouthY} Q${mouthWidth / 4} ${mouthY - 2 * scale} ${mouthWidth / 2} ${mouthY}`
      break
    case 'sad':
      // Frown
      mouthPath = `M${-mouthWidth / 2} ${mouthY + 2 * scale} Q0 ${mouthY - 3 * scale} ${mouthWidth / 2} ${mouthY + 2 * scale}`
      break
    case 'neutral':
    default:
      // Small smile
      mouthPath = `M${-mouthWidth / 2} ${mouthY} Q0 ${mouthY + 2 * scale} ${mouthWidth / 2} ${mouthY}`
      break
  }

  return (
    <g>
      {/* Eyes */}
      <circle cx={20 * scale - eyeSpacing} cy={eyeLY} r={eyeRadius} fill="#2D2A4B" />
      <circle cx={20 * scale + eyeSpacing} cy={eyeRY} r={eyeRadius} fill="#2D2A4B" />

      {/* Mouth */}
      <path
        d={mouthPath}
        stroke="#2D2A4B"
        strokeWidth={1.5 * scale}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}

// ── Pin SVG ─────────────────────────────────────────────────────────────────

function PinSVG({
  color,
  size,
  expression,
  showShadow = true,
}: {
  color: string
  size: number
  expression: Expression
  showShadow?: boolean
}) {
  const scale = size / 40

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: showShadow
          ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))'
          : undefined,
      }}
    >
      <defs>
        <linearGradient id="pinGradient" x1="20" y1="0" x2="20" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFB347" />
          <stop offset="50%" stopColor="#FF8C42" />
          <stop offset="100%" stopColor="#F74211" />
        </linearGradient>
      </defs>

      {/* Pin body */}
      <path
        d="M20 48C20 48 40 34 40 20C40 9.0 31.0 0 20 0C9.0 0 0 9.0 0 20C0 34 20 48 20 48Z"
        fill={color === 'var(--tgo-surface-1)' || color === 'var(--tgo-network-dormant)'
          ? color
          : 'url(#pinGradient)'
        }
      />

      {/* White circle for face */}
      <circle cx="20" cy="20" r="12" fill="white" />

      {/* Face */}
      <FaceExpression expression={expression} size={size} />
    </svg>
  )
}

// ── Avatar SVG ──────────────────────────────────────────────────────────────

function AvatarSVG({
  color,
  size,
  expression,
}: {
  color: string
  size: number
  expression: Expression
}) {
  const scale = size / 40

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle cx="20" cy="20" r="20" fill={color} />

      {/* Inner white circle */}
      <circle cx="20" cy="20" r="14" fill="white" />

      {/* Face */}
      <FaceExpression expression={expression} size={size} />
    </svg>
  )
}

// ── Inline SVG (just face) ─────────────────────────────────────────────────

function InlineSVG({
  color,
  size,
  expression,
}: {
  color: string
  size: number
  expression: Expression
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Colored circle background */}
      <circle cx="20" cy="20" r="20" fill={color} />

      {/* Face */}
      <FaceExpression expression={expression} size={size} />
    </svg>
  )
}

// ── Animation styles ────────────────────────────────────────────────────────

const animationStyles: Record<AnimationType, React.CSSProperties> = {
  none: {},
  pulse: {
    animation: 'punto-tgo-pulse 2s ease-in-out infinite',
  },
  bounce: {
    animation: 'punto-tgo-bounce 1s ease-in-out infinite',
  },
  wiggle: {
    animation: 'punto-tgo-wiggle 3s ease-in-out infinite',
  },
}

// ── Main component ──────────────────────────────────────────────────────────

export default function PuntoTGO({
  variant = 'avatar',
  status = 'idle',
  networkStatus,
  size = 'md',
  expression: expressionProp,
  animate = true,
  onClick,
  className = '',
}: PuntoTGOProps) {
  const pixelSize = SIZE_MAP[size]

  // Determine expression
  const expression = useMemo(() => {
    if (expressionProp) return expressionProp
    if (networkStatus) return NETWORK_EXPRESSION[networkStatus]
    return STATUS_EXPRESSION[status]
  }, [expressionProp, networkStatus, status])

  // Determine color
  const color = useMemo(() => {
    if (networkStatus) return NETWORK_COLORS[networkStatus]
    return STATUS_COLORS[status]
  }, [networkStatus, status])

  // Determine animation
  const animation = useMemo(() => {
    if (!animate) return 'none'
    if (networkStatus === 'live') return 'pulse'
    return STATUS_ANIMATION[status]
  }, [animate, networkStatus, status])

  const style: React.CSSProperties = {
    ...animationStyles[animation],
    cursor: onClick ? 'pointer' : undefined,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const content = useMemo(() => {
    switch (variant) {
      case 'pin':
        return (
          <PinSVG
            color={color}
            size={pixelSize}
            expression={expression}
          />
        )
      case 'avatar':
        return (
          <AvatarSVG
            color={color}
            size={pixelSize}
            expression={expression}
          />
        )
      case 'inline':
        return (
          <InlineSVG
            color={color}
            size={pixelSize}
            expression={expression}
          />
        )
    }
  }, [variant, color, pixelSize, expression])

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`punto-tgo ${className}`}
        style={style}
        aria-label={`Punto TGO - ${status}`}
      >
        {content}
      </button>
    )
  }

  return (
    <span
      className={`punto-tgo ${className}`}
      style={style}
      role="img"
      aria-label={`Punto TGO - ${status}`}
    >
      {content}
    </span>
  )
}

// ── CSS Keyframes (inject once) ─────────────────────────────────────────────

const STYLE_ID = 'punto-tgo-styles'

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes punto-tgo-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.05); opacity: 0.9; }
    }
    @keyframes punto-tgo-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    @keyframes punto-tgo-wiggle {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-3deg); }
      75% { transform: rotate(3deg); }
    }
  `
  document.head.appendChild(style)
}

// Auto-inject on client side
if (typeof window !== 'undefined') {
  injectStyles()
}
