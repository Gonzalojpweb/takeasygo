'use client'

// ── PuntoTGO (Living City System v1.0) ──────────────────────────────────────
//
// Componente principal del Mascot TGO para la experiencia de consumidor.
// Cumple estrictamente con la especificación Living City System (LCS v1.0).
//
// 1. Eje 1 (La Cara): EXACTAMENTE 3 EXPRESIONES
//    - 'happy'  (Activo — operando y recibiendo pedidos ahora)
//    - 'sleepy' (Descansando — fuera de horario, catálogo o inactivo)
//    - 'wink'   (Con guiño — oferta o promoción activa ahora)
//
// 2. Eje 2 (El Anillo y la Corona — ICO):
//    - 'none'   (ICO en formación — sin penalización visual)
//    - 'thin'   (Anillo fino — consolidando)
//    - 'marked' (Anillo marcado — confiable, tono de marca)
//    - 'gold'   (Anillo dorado — referente)
//    - hasCrown (La Corona — accesorio único reservado al referente máximo de zona)
//
// 3. Insignias:
//    - isNew    (Badge "NUEVO" para locales en sus primeros 30 días)

import { useMemo } from 'react'

export type LcsFaceExpression = 'happy' | 'sleepy' | 'wink'
export type LcsRingScale = 'none' | 'thin' | 'marked' | 'gold'
export type PuntoTGOSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface PuntoTGOProps {
  expression?: LcsFaceExpression
  ring?: LcsRingScale
  hasCrown?: boolean
  isNew?: boolean
  size?: PuntoTGOSize
  animate?: boolean
  onClick?: () => void
  className?: string
}

const SIZE_MAP: Record<PuntoTGOSize, { width: number; height: number }> = {
  xs: { width: 24, height: 32 },
  sm: { width: 32, height: 42 },
  md: { width: 40, height: 52 },
  lg: { width: 56, height: 72 },
  xl: { width: 80, height: 104 },
}

// ── Face Expression SVG ──────────────────────────────────────────────────────

function FaceExpression({ expression }: { expression: LcsFaceExpression }) {
  const eyeRadius = 1.8
  const eyeY = 16
  const eyeLeftX = 15
  const eyeRightX = 25
  const mouthY = 21

  switch (expression) {
    case 'wink':
      return (
        <g>
          {/* Left Eye: Open & bright */}
          <circle cx={eyeLeftX} cy={eyeY} r={eyeRadius} fill="#2D2A4B" />
          {/* Right Eye: Playful Wink (curved arc) */}
          <path
            d="M23 15.5 Q25 14 27 15.5"
            stroke="#2D2A4B"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          {/* Smile Mouth */}
          <path
            d="M17 21 Q20 25 23 21"
            stroke="#2D2A4B"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )

    case 'sleepy':
      return (
        <g>
          {/* Closed Eyes: Resting horizontal lines */}
          <path
            d="M13.5 16.5 L16.5 16.5"
            stroke="#2D2A4B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M23.5 16.5 L26.5 16.5"
            stroke="#2D2A4B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Flat resting mouth */}
          <path
            d="M17.5 21 L22.5 21"
            stroke="#2D2A4B"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )

    case 'happy':
    default:
      return (
        <g>
          {/* Eyes */}
          <circle cx={eyeLeftX} cy={eyeY} r={eyeRadius} fill="#2D2A4B" />
          <circle cx={eyeRightX} cy={eyeY} r={eyeRadius} fill="#2D2A4B" />
          {/* Smile Mouth */}
          <path
            d="M17 21 Q20 24.5 23 21"
            stroke="#2D2A4B"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )
  }
}

// ── Ring Component (Eje 2: ICO Scale) ────────────────────────────────────────

function ICOBaseRing({ ring }: { ring: LcsRingScale }) {
  if (ring === 'none') return null

  switch (ring) {
    case 'thin':
      return (
        <ellipse
          cx="20"
          cy="49"
          rx="14"
          ry="3.5"
          fill="none"
          stroke="#94A3B8"
          strokeWidth="1.5"
          opacity="0.8"
        />
      )
    case 'marked':
      return (
        <g>
          <ellipse
            cx="20"
            cy="49"
            rx="15"
            ry="4"
            fill="none"
            stroke="#FF8C42"
            strokeWidth="2.5"
          />
        </g>
      )
    case 'gold':
      return (
        <g>
          <ellipse
            cx="20"
            cy="49"
            rx="16"
            ry="4.5"
            fill="none"
            stroke="url(#puntoTgoGoldRingGradient)"
            strokeWidth="3.2"
            style={{ filter: 'drop-shadow(0 0 3px rgba(255, 215, 0, 0.7))' }}
          />
        </g>
      )
    default:
      return null
  }
}

// ── Crown Component (La Corona — Excepción de accesorio) ─────────────────────

function CrownAccessory() {
  return (
    <g style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
      <path
        d="M12 4 L14.5 8.5 L20 2 L25.5 8.5 L28 4 L26.5 11 L13.5 11 Z"
        fill="url(#puntoTgoCrownGradient)"
        stroke="#B45309"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* Crown jewels */}
      <circle cx="12" cy="3.5" r="0.9" fill="#FFF" />
      <circle cx="20" cy="1.5" r="1.1" fill="#FFF" />
      <circle cx="28" cy="3.5" r="0.9" fill="#FFF" />
    </g>
  )
}

// ── Pin SVG Component ───────────────────────────────────────────────────────

function PinSVG({
  expression = 'happy',
  ring = 'none',
  hasCrown = false,
  isNew = false,
  width,
  height,
}: {
  expression?: LcsFaceExpression
  ring?: LcsRingScale
  hasCrown?: boolean
  isNew?: boolean
  width: number
  height: number
}) {
  const isSleepy = expression === 'sleepy'

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.22))',
        overflow: 'visible',
      }}
    >
      <defs>
        {/* Brand Orange Gradient */}
        <linearGradient id="puntoTgoGradient" x1="20" y1="0" x2="20" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFB347" />
          <stop offset="50%" stopColor="#FF8C42" />
          <stop offset="100%" stopColor="#F74211" />
        </linearGradient>
        {/* Gold Ring Gradient */}
        <linearGradient id="puntoTgoGoldRingGradient" x1="0" y1="49" x2="40" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE259" />
          <stop offset="50%" stopColor="#FFA751" />
          <stop offset="100%" stopColor="#FFD700" />
        </linearGradient>
        {/* Crown Gradient */}
        <linearGradient id="puntoTgoCrownGradient" x1="12" y1="2" x2="28" y2="11" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#CA8A04" />
        </linearGradient>
      </defs>

      {/* Base Ring (Eje 2: ICO Scale) */}
      <ICOBaseRing ring={ring} />

      {/* Pin body (Teardrop shape — Doc 01 §3.2) */}
      <path
        d="M20 52C20 52 40 36 40 22C40 10 31 0 20 0C9 0 0 10 0 22C0 36 20 52 20 52Z"
        fill={isSleepy ? '#9CA3AF' : 'url(#puntoTgoGradient)'}
      />

      {/* White circle for face */}
      <circle cx="20" cy="20" r="12" fill="white" />

      {/* Face Expression (Eje 1: Real-time Operational Status) */}
      <FaceExpression expression={expression} />

      {/* Crown Accessory (Special Top ICO Exception) */}
      {hasCrown && <CrownAccessory />}

      {/* "NUEVO" Badge Insignia */}
      {isNew && (
        <g transform="translate(10, 42)">
          <rect
            x="0"
            y="0"
            width="20"
            height="8"
            rx="4"
            fill="#3B82F6"
            stroke="#FFFFFF"
            strokeWidth="0.8"
          />
          <text
            x="10"
            y="6"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="5"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
          >
            NUEVO
          </text>
        </g>
      )}
    </svg>
  )
}

// ── Main PuntoTGO Component ─────────────────────────────────────────────────

export default function PuntoTGO({
  expression = 'happy',
  ring = 'none',
  hasCrown = false,
  isNew = false,
  size = 'md',
  animate = true,
  onClick,
  className = '',
}: PuntoTGOProps) {
  const dimensions = SIZE_MAP[size]

  // Movement principle (§11): breathing animation for active live pin
  const animationStyle: React.CSSProperties = useMemo(() => {
    if (animate && expression !== 'sleepy') {
      return { animation: 'punto-tgo-breathe 2.5s ease-in-out infinite' }
    }
    return {}
  }, [animate, expression])

  const containerStyle: React.CSSProperties = {
    ...animationStyle,
    cursor: onClick ? 'pointer' : undefined,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const content = (
    <PinSVG
      expression={expression}
      ring={ring}
      hasCrown={hasCrown}
      isNew={isNew}
      width={dimensions.width}
      height={dimensions.height}
    />
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`punto-tgo ${className}`}
        style={containerStyle}
        aria-label={`Punto TGO - ${expression}`}
      >
        {content}
      </button>
    )
  }

  return (
    <span
      className={`punto-tgo ${className}`}
      style={containerStyle}
      role="img"
      aria-label={`Punto TGO - ${expression}`}
    >
      {content}
    </span>
  )
}

// ── Style Auto-Injection (Client-side) ──────────────────────────────────────

const STYLE_ID = 'punto-tgo-lcs-styles'

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes punto-tgo-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04); }
    }
  `
  document.head.appendChild(style)
}

if (typeof window !== 'undefined') {
  injectStyles()
}
