'use client'

// ── AnimatedNumber ────────────────────────────────────────────────────────────
//
// Componente atómico que anima la transición entre números.
//
// Responsabilidades:
//   1. Detectar cambio en el valor
//   2. Animar la transición numérica (count up/down)
//   3. Mostrar sufijo opcional (ej: "min", "ms")
//
// Dependencias:
//   - framer-motion
//   - tokens --tgo-*
//
// Uso:
//   <AnimatedNumber value={18} />
//   <AnimatedNumber value={11} suffix="min" />
//   <AnimatedNumber value={42} duration={600} />

import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface AnimatedNumberProps {
  /** Valor numérico a mostrar */
  value: number
  /** Sufijo opcional (ej: "min", "abiertos") */
  suffix?: string
  /** Duración de la animación en ms. Default: 400 */
  duration?: number
  /** Estilos del contenedor */
  style?: React.CSSProperties
  /** Estilos del número */
  numberStyle?: React.CSSProperties
  /** Estilos del sufijo */
  suffixStyle?: React.CSSProperties
}

export default function AnimatedNumber({
  value,
  suffix,
  duration = 400,
  style,
  numberStyle,
  suffixStyle,
}: AnimatedNumberProps) {
  const spring = useSpring(value, {
    duration,
    bounce: 0,
  })

  const display = useTransform(spring, (v) => Math.round(v))
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      setDisplayValue(v)
    })
    return unsubscribe
  }, [display])

  return (
    <span style={style}>
      <motion.span
        style={{
          fontVariantNumeric: 'tabular-nums',
          ...numberStyle,
        }}
      >
        {displayValue}
      </motion.span>
      {suffix && (
        <span style={suffixStyle}>
          {suffix}
        </span>
      )}
    </span>
  )
}
