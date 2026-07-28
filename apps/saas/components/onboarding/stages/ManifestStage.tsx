'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

interface ManifestStageProps {
  onComplete: () => void
}

interface Slide {
  title: string
  body: string
  illustration: React.ReactNode
}

// ── SVG Illustrations ───────────────────────────────────────────────

function CityAliveIllustration() {
  return (
    <div className="w-48 h-48 rounded-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'rgba(247, 66, 17, 0.05)', border: '1px solid rgba(247, 66, 17, 0.1)' }}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200" fill="none">
        {/* Buildings */}
        <rect x="30" y="80" width="20" height="80" rx="2" fill="rgba(247, 66, 17, 0.15)" />
        <rect x="55" y="60" width="24" height="100" rx="2" fill="rgba(247, 66, 17, 0.12)" />
        <rect x="84" y="90" width="18" height="70" rx="2" fill="rgba(247, 66, 17, 0.1)" />
        <rect x="107" y="50" width="22" height="110" rx="2" fill="rgba(247, 66, 17, 0.18)" />
        <rect x="134" y="70" width="20" height="90" rx="2" fill="rgba(247, 66, 17, 0.12)" />
        <rect x="158" y="85" width="16" height="75" rx="2" fill="rgba(247, 66, 17, 0.1)" />
        {/* Windows */}
        {[30, 55, 107, 134].map((x) => (
          [0, 1, 2, 3].map((row) => (
            <rect key={`${x}-${row}`} x={x + 4} y={90 + row * 18} width="4" height="4" rx="1" fill="rgba(247, 66, 17, 0.3)" />
          ))
        ))}
        {/* People dots */}
        <circle cx="45" cy="168" r="3" fill="#F74211" opacity="0.5" />
        <circle cx="75" cy="165" r="3" fill="#F74211" opacity="0.4" />
        <circle cx="120" cy="168" r="3" fill="#F74211" opacity="0.5" />
        <circle cx="150" cy="166" r="3" fill="#F74211" opacity="0.3" />
        {/* Connection lines */}
        <path d="M45 168 Q 80 155 120 168" stroke="#F74211" strokeWidth="1" opacity="0.2" fill="none" />
        <path d="M75 165 Q 110 150 150 166" stroke="#F74211" strokeWidth="1" opacity="0.15" fill="none" />
      </svg>
    </div>
  )
}

function NeighborhoodsIllustration() {
  return (
    <div className="w-48 h-48 rounded-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'rgba(22, 163, 74, 0.05)', border: '1px solid rgba(22, 163, 74, 0.1)' }}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200" fill="none">
        {/* Zone circles */}
        <circle cx="100" cy="100" r="60" stroke="#12B76A" strokeWidth="1" opacity="0.15" />
        <circle cx="100" cy="100" r="40" stroke="#12B76A" strokeWidth="1" opacity="0.2" />
        <circle cx="100" cy="100" r="20" stroke="#12B76A" strokeWidth="1" opacity="0.3" />
        {/* Location pins */}
        <circle cx="70" cy="80" r="6" fill="#12B76A" opacity="0.4" />
        <circle cx="130" cy="85" r="5" fill="#12B76A" opacity="0.3" />
        <circle cx="90" cy="120" r="7" fill="#12B76A" opacity="0.5" />
        <circle cx="115" cy="115" r="4" fill="#12B76A" opacity="0.3" />
        {/* Connection paths */}
        <path d="M70 80 Q 100 90 130 85" stroke="#12B76A" strokeWidth="1.5" opacity="0.25" fill="none" />
        <path d="M70 80 Q 80 100 90 120" stroke="#12B76A" strokeWidth="1.5" opacity="0.25" fill="none" />
        <path d="M90 120 Q 105 118 115 115" stroke="#12B76A" strokeWidth="1.5" opacity="0.2" fill="none" />
      </svg>
    </div>
  )
}

function RecommendationsIllustration() {
  return (
    <div className="w-48 h-48 rounded-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'rgba(247, 66, 17, 0.05)', border: '1px solid rgba(247, 66, 17, 0.1)' }}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200" fill="none">
        {/* Cards stack */}
        <rect x="55" y="50" width="90" height="30" rx="8" fill="rgba(247, 66, 17, 0.12)" />
        <rect x="60" y="85" width="85" height="30" rx="8" fill="rgba(247, 66, 17, 0.15)" />
        <rect x="65" y="120" width="80" height="30" rx="8" fill="rgba(247, 66, 17, 0.2)" />
        {/* Star ratings */}
        <path d="M70 60 l3 6 l7 1 l-5 5 l1 7 l-6-3 l-6 3 l1-7 l-5-5 l7-1z" fill="#F74211" opacity="0.4" />
        <path d="M75 95 l3 6 l7 1 l-5 5 l1 7 l-6-3 l-6 3 l1-7 l-5-5 l7-1z" fill="#F74211" opacity="0.5" />
        <path d="M80 130 l3 6 l7 1 l-5 5 l1 7 l-6-3 l-6 3 l1-7 l-5-5 l7-1z" fill="#F74211" opacity="0.6" />
        {/* AI sparkle */}
        <circle cx="140" cy="60" r="2" fill="#F74211" opacity="0.5" />
        <circle cx="148" cy="70" r="1.5" fill="#F74211" opacity="0.3" />
        <circle cx="145" cy="55" r="1" fill="#F74211" opacity="0.4" />
      </svg>
    </div>
  )
}

function ConnectionIllustration() {
  return (
    <div className="w-48 h-48 rounded-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)' }}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200" fill="none">
        {/* People nodes */}
        <circle cx="60" cy="70" r="10" fill="rgba(59, 130, 246, 0.2)" />
        <circle cx="140" cy="70" r="10" fill="rgba(59, 130, 246, 0.2)" />
        <circle cx="100" cy="130" r="10" fill="rgba(59, 130, 246, 0.2)" />
        {/* Commerce nodes */}
        <rect x="85" y="55" width="30" height="20" rx="4" fill="rgba(247, 66, 17, 0.2)" />
        <rect x="55" y="110" width="25" height="18" rx="4" fill="rgba(247, 66, 17, 0.15)" />
        <rect x="120" y="115" width="25" height="18" rx="4" fill="rgba(247, 66, 17, 0.15)" />
        {/* Connection lines */}
        <path d="M60 70 L 100 65" stroke="#3B82F6" strokeWidth="1.5" opacity="0.3" />
        <path d="M140 70 L 100 65" stroke="#3B82F6" strokeWidth="1.5" opacity="0.3" />
        <path d="M60 70 L 65 119" stroke="#3B82F6" strokeWidth="1.5" opacity="0.2" />
        <path d="M140 70 L 132 124" stroke="#3B82F6" strokeWidth="1.5" opacity="0.2" />
        <path d="M100 130 L 65 119" stroke="#3B82F6" strokeWidth="1.5" opacity="0.25" />
        <path d="M100 130 L 132 124" stroke="#3B82F6" strokeWidth="1.5" opacity="0.25" />
      </svg>
    </div>
  )
}

function AllInOneIllustration() {
  return (
    <div className="w-48 h-48 rounded-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'rgba(247, 66, 17, 0.05)', border: '1px solid rgba(247, 66, 17, 0.1)' }}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200" fill="none">
        {/* Phone frame */}
        <rect x="65" y="35" width="70" height="130" rx="12" stroke="#F74211" strokeWidth="2" opacity="0.3" fill="none" />
        {/* Screen content blocks */}
        <rect x="72" y="50" width="56" height="16" rx="4" fill="rgba(247, 66, 17, 0.15)" />
        <rect x="72" y="72" width="56" height="12" rx="3" fill="rgba(247, 66, 17, 0.1)" />
        <rect x="72" y="90" width="26" height="26" rx="6" fill="rgba(247, 66, 17, 0.12)" />
        <rect x="102" y="90" width="26" height="26" rx="6" fill="rgba(247, 66, 17, 0.08)" />
        <rect x="72" y="122" width="56" height="10" rx="3" fill="rgba(247, 66, 17, 0.1)" />
        <rect x="72" y="138" width="56" height="18" rx="6" fill="#F74211" opacity="0.3" />
        {/* Floating elements */}
        <circle cx="45" cy="70" r="4" fill="#F74211" opacity="0.2" />
        <circle cx="155" cy="90" r="3" fill="#F74211" opacity="0.15" />
        <circle cx="50" cy="120" r="3" fill="#F74211" opacity="0.2" />
      </svg>
    </div>
  )
}

function WereHereIllustration() {
  return (
    <div className="w-48 h-48 rounded-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'rgba(247, 66, 17, 0.08)', border: '1px solid rgba(247, 66, 17, 0.15)' }}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200" fill="none">
        {/* Large TGO icon placeholder */}
        <circle cx="100" cy="85" r="30" fill="rgba(247, 66, 17, 0.2)" />
        <text x="100" y="92" textAnchor="middle" fill="#F74211" fontSize="20" fontWeight="bold" opacity="0.6">
          TGO
        </text>
        {/* Radiating circles */}
        <circle cx="100" cy="85" r="45" stroke="#F74211" strokeWidth="1" opacity="0.15" />
        <circle cx="100" cy="85" r="60" stroke="#F74211" strokeWidth="1" opacity="0.08" />
        {/* Sparkles */}
        <circle cx="55" cy="60" r="2" fill="#F74211" opacity="0.4" />
        <circle cx="145" cy="65" r="2" fill="#F74211" opacity="0.3" />
        <circle cx="70" cy="130" r="1.5" fill="#F74211" opacity="0.3" />
        <circle cx="135" cy="125" r="1.5" fill="#F74211" opacity="0.25" />
      </svg>
    </div>
  )
}

// ── Slides Data ─────────────────────────────────────────────────────

const SLIDES: Slide[] = [
  {
    title: 'Todo empieza cerca.',
    body: 'Muchas veces, los mejores lugares no están lejos. Están a unas pocas cuadras. Solo falta descubrirlos.',
    illustration: <CityAliveIllustration />,
  },
  {
    title: 'Viví tu ciudad de otra manera.',
    body: 'Creemos en una ciudad donde disfrutar una buena comida, un café o un encuentro no implique recorrer kilómetros. Inspirados en la idea de la Ciudad de los 15 minutos, queremos acercarte experiencias que tengan sentido para tu día a día.',
    illustration: <NeighborhoodsIllustration />,
  },
  {
    title: 'Descubrí más. Perdé menos tiempo.',
    body: 'TGO aprende de tus preferencias para mostrarte primero los lugares que realmente pueden interesarte. Menos búsquedas. Más descubrimientos.',
    illustration: <RecommendationsIllustration />,
  },
  {
    title: 'Conectamos personas y comercios.',
    body: 'Cada lugar que encontrás en TGO forma parte de una red que apuesta por una gastronomía más cercana, más humana y más conectada con su comunidad.',
    illustration: <ConnectionIllustration />,
  },
  {
    title: 'Todo en un solo lugar.',
    body: 'Explorá. Reservá. Pedí. Pagá. Seguí tu pedido. Accedé a beneficios exclusivos. Todo desde una única experiencia.',
    illustration: <AllInOneIllustration />,
  },
  {
    title: 'Ya estamos.',
    body: 'Ahora dejá que te mostremos todo lo que tenés cerca.',
    illustration: <WereHereIllustration />,
  },
]

// ── Component ───────────────────────────────────────────────────────

export default function ManifestStage({ onComplete }: ManifestStageProps) {
  const [current, setCurrent] = useState(0)
  const [progress, setProgress] = useState(0)
  const isLast = current === SLIDES.length - 1

  const next = useCallback(() => {
    if (current < SLIDES.length - 1) {
      setCurrent((prev) => prev + 1)
      setProgress(0)
    } else {
      onComplete()
    }
  }, [current, onComplete])

  // Auto-advance timer
  useEffect(() => {
    if (isLast) return

    const INTERVAL = 50 // Update every 50ms
    const DURATION = 5000 // 5 seconds per slide
    let elapsed = 0

    const timer = setInterval(() => {
      elapsed += INTERVAL
      setProgress((elapsed / DURATION) * 100)
      if (elapsed >= DURATION) {
        clearInterval(timer)
        next()
      }
    }, INTERVAL)

    return () => clearInterval(timer)
  }, [current, isLast, next])

  const slide = SLIDES[current]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex flex-col"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Progress bar */}
      <div className="relative h-[3px] w-full" style={{ backgroundColor: 'var(--tgo-surface-1)' }}>
        <motion.div
          className="absolute left-0 top-0 h-full"
          style={{ backgroundColor: 'var(--tgo-brand-primary)' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.05, ease: 'linear' }}
        />
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center"
          >
            {/* Illustration */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="mb-10"
            >
              {slide.illustration}
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-2xl font-bold tracking-tight mb-4 text-center max-w-[300px]"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              {slide.title}
            </motion.h2>

            {/* Body */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-sm text-center leading-relaxed max-w-[280px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              {slide.body}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-6 pb-10 flex flex-col items-center z-20">
        {isLast ? (
          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            whileTap={{ scale: 0.96 }}
            onClick={onComplete}
            className="w-full h-16 rounded-2xl flex items-center justify-center gap-2 font-black text-base uppercase tracking-widest transition-all duration-150"
            style={{
              backgroundColor: 'var(--tgo-brand-primary)',
              color: 'var(--tgo-text-on-accent)',
              boxShadow: '0 16px 32px -4px rgba(247, 66, 17, 0.5)',
            }}
          >
            Vamos
            <ChevronRight size={18} />
          </motion.button>
        ) : (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            whileTap={{ scale: 0.96 }}
            onClick={next}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all duration-150"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'var(--tgo-text-primary)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            Siguiente
            <ChevronRight size={14} />
          </motion.button>
        )}

        {/* Skip button (not on last slide) */}
        {!isLast && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            whileTap={{ scale: 0.97 }}
            onClick={onComplete}
            className="mt-3 text-xs font-medium transition-colors duration-150"
            style={{ color: 'var(--tgo-surface-3)' }}
          >
            Saltar
          </motion.button>
        )}
      </div>

      {/* Tap zones for manual navigation */}
      {!isLast && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/5 z-10 cursor-w-resize"
            onClick={() => {
              if (current > 0) {
                setCurrent((prev) => prev - 1)
                setProgress(0)
              }
            }}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/5 z-10 cursor-e-resize"
            onClick={next}
          />
        </>
      )}
    </motion.div>
  )
}
