'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, X } from 'lucide-react'

const STEPS = [
  {
    title: 'Descubrimiento',
    description: 'Encuentra los restaurantes más cercanos a tu ubicación que ofrecen Takeaway.',
  },
  {
    title: 'Tiempos Reales',
    description: 'Conoce los tiempos estimados de preparación y retiro en tiempo real.',
  },
  {
    title: 'Compra Directa',
    description: 'Realiza tu compra directamente desde el menú digital del restaurante, sin intermediarios.',
  },
  {
    title: 'Notificaciones',
    description: 'Recibe una alerta cuando tu pedido esté listo para retirar. ¡Sin esperas!',
  },
]

// ── CUSTOM PREMIUM VECTOR ILLUSTRATIONS ──

function DiscoveryIllustration() {
  return (
    <div className="w-52 h-52 rounded-full bg-[#1a1b2e]/60 border border-white/5 flex items-center justify-center relative overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#e8441a]/10 to-transparent" />
      
      {/* Map Grid mesh */}
      <svg className="absolute inset-0 w-full h-full text-[#8b8fa8]/10" fill="none" stroke="currentColor" strokeWidth="1">
        <line x1="20%" y1="0" x2="20%" y2="100%" />
        <line x1="40%" y1="0" x2="40%" y2="100%" />
        <line x1="60%" y1="0" x2="60%" y2="100%" />
        <line x1="80%" y1="0" x2="80%" y2="100%" />
        <line x1="0" y1="20%" x2="100%" y2="20%" />
        <line x1="0" y1="40%" x2="100%" y2="40%" />
        <line x1="0" y1="60%" x2="100%" y2="60%" />
        <line x1="0" y1="80%" x2="100%" y2="80%" />
      </svg>

      {/* Journey Path */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        <path 
          d="M 40,160 Q 90,140 100,100 T 150,50" 
          fill="none" 
          stroke="#e8441a" 
          strokeWidth="3.5" 
          strokeDasharray="6,8" 
          style={{ animation: 'dash 12s linear infinite' }}
        />
        {/* Pulse effect at start location */}
        <circle cx="40" cy="160" r="8" fill="#e8441a" className="opacity-20 animate-ping" />
        <circle cx="40" cy="160" r="4" fill="#e8441a" />
        
        {/* Location pin 1 (gray) */}
        <g transform="translate(100, 100) scale(0.6)">
          <circle cx="0" cy="0" r="20" fill="#1a1b2e" stroke="#8b8fa8" strokeWidth="2.5" />
          <path d="M0 -10 C5 -10 8 -7 8 -2 C8 5 0 15 0 15 C0 15 -8 5 -8 -2 C-8 -7 -5 -10 0 -10 Z" fill="#8b8fa8" />
        </g>
        
        {/* Main destination pin (TGO logo style) */}
        <g transform="translate(150, 50) scale(0.85)" className="animate-bounce">
          <circle cx="0" cy="18" r="8" fill="#e8441a" className="opacity-30 animate-ping" />
          {/* TGO Logo shape locator pin */}
          <path d="M0 -18 C9 -18 16 -11 16 -1 C16 11 0 27 0 27 C0 27 -16 11 -16 -1 C-16 -11 -9 -18 0 -18 Z" fill="#e8441a" />
          <circle cx="0" cy="-1" r="5" fill="#f5f0e8" />
        </g>
      </svg>
    </div>
  )
}

function RealTimePrepIllustration() {
  return (
    <div className="w-52 h-52 rounded-full bg-[#1a1b2e]/60 border border-white/5 flex items-center justify-center relative overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#e8441a]/10 to-transparent" />
      
      {/* Circular stopwatch timer */}
      <svg className="w-36 h-36 text-[#8b8fa8]/20" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="50" cy="50" r="40" />
        <circle 
          cx="50" 
          cy="50" 
          r="40" 
          stroke="#e8441a" 
          strokeWidth="4" 
          strokeDasharray="160 90" 
          strokeLinecap="round" 
          className="rotate-[-90deg] origin-center" 
        />
        
        {/* Tick marks */}
        <line x1="50" y1="12" x2="50" y2="17" stroke="#e8441a" strokeWidth="2.5" />
        <line x1="50" y1="83" x2="50" y2="88" stroke="currentColor" />
        <line x1="12" y1="50" x2="17" y2="50" stroke="currentColor" />
        <line x1="83" y1="50" x2="88" y2="50" stroke="currentColor" />
        
        {/* Clock hands */}
        <line 
          x1="50" 
          y1="50" 
          x2="50" 
          y2="28" 
          stroke="#f5f0e8" 
          strokeWidth="3.5" 
          strokeLinecap="round" 
          className="origin-[50px_50px]"
          style={{ animation: 'spin 22s linear infinite' }}
        />
        <line 
          x1="50" 
          y1="50" 
          x2="66" 
          y2="50" 
          stroke="#f5f0e8" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          className="origin-[50px_50px]"
          style={{ animation: 'spin 140s linear infinite' }}
        />
        <circle cx="50" cy="50" r="3.5" fill="#e8441a" />
      </svg>

      {/* Time overlay indicator */}
      <div className="absolute bottom-6 bg-[#1a1b2e] border border-white/10 px-3.5 py-1 rounded-full text-[10px] font-black text-[#e8441a] tracking-widest shadow-lg">
        10 MIN
      </div>
    </div>
  )
}

function DirectMenuIllustration() {
  return (
    <div className="w-52 h-52 rounded-full bg-[#1a1b2e]/60 border border-white/5 flex items-center justify-center relative overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#e8441a]/10 to-transparent" />
      
      {/* Smartphone mockup */}
      <svg className="w-28 h-28 text-[#8b8fa8]/40" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.5">
        <rect x="26" y="10" width="48" height="80" rx="7" stroke="#8b8fa8" strokeWidth="3" fill="#1a1b2e" />
        <line x1="45" y1="14" x2="55" y2="14" stroke="#8b8fa8" strokeWidth="2.5" strokeLinecap="round" />
        
        {/* Mock Menu lists */}
        <rect x="32" y="24" width="36" height="12" rx="3" fill="#8b8fa8" fillOpacity="0.1" stroke="#8b8fa8" strokeWidth="1" />
        <circle cx="38" cy="30" r="4.5" fill="#e8441a" />
        <line x1="47" y1="28" x2="62" y2="28" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" />
        <line x1="47" y1="32" x2="57" y2="32" stroke="#8b8fa8" strokeWidth="1.5" strokeLinecap="round" />

        <rect x="32" y="42" width="36" height="12" rx="3" fill="#8b8fa8" fillOpacity="0.1" stroke="#8b8fa8" strokeWidth="1" />
        <circle cx="38" cy="48" r="4.5" fill="#e8441a" />
        <line x1="47" y1="46" x2="62" y2="46" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" />
        <line x1="47" y1="50" x2="57" y2="50" stroke="#8b8fa8" strokeWidth="1.5" strokeLinecap="round" />
        
        {/* Bottom checkout action tag inside mockup */}
        <rect x="32" y="64" width="36" height="8" rx="2" fill="#e8441a" />
        <line x1="44" y1="68" x2="56" y2="68" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" />
      </svg>

      {/* Floating checkout bag tag */}
      <div className="absolute top-10 right-10 w-9 h-9 rounded-full bg-[#e8441a] border-2 border-[#1a1b2e] flex items-center justify-center text-white shadow-xl animate-bounce">
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="3">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      </div>
    </div>
  )
}

function NotificationsIllustration() {
  return (
    <div className="w-52 h-52 rounded-full bg-[#1a1b2e]/60 border border-white/5 flex items-center justify-center relative overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#e8441a]/10 to-transparent" />
      
      {/* Ringing Bell & Signal Waves */}
      <svg className="w-28 h-28" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.5">
        {/* Sound/Signal waves */}
        <circle cx="50" cy="50" r="38" stroke="#8b8fa8" strokeWidth="1.2" strokeDasharray="4 8" className="opacity-20 origin-center" style={{ animation: 'spin 40s linear infinite' }} />
        <circle cx="50" cy="50" r="30" stroke="#e8441a" strokeWidth="1.5" strokeDasharray="6 6" className="opacity-40 origin-center" style={{ animation: 'spin 20s linear reverse infinite' }} />
        
        {/* Bell Body */}
        <g transform="translate(50, 48)" className="origin-top" style={{ animation: 'wiggle 1.4s ease-in-out infinite' }}>
          <path d="M-12,12 C-12,8 -8,4 0,4 C8,4 12,8 12,12 L14,20 L-14,20 Z" fill="#e8441a" stroke="#e8441a" strokeWidth="2" />
          <path d="M-18,20 L18,20" stroke="#f5f0e8" strokeWidth="4" strokeLinecap="round" />
          <circle cx="0" cy="24" r="4.5" fill="#f5f0e8" />
          <path d="M-4,4 C-4,0 4,0 4,4" stroke="#f5f0e8" strokeWidth="2" />
        </g>
      </svg>

      {/* Floating status flag */}
      <div className="absolute bottom-8 bg-[#e8441a] px-3.5 py-1.5 rounded-xl text-[9px] font-black text-[#f5f0e8] uppercase tracking-widest shadow-lg flex items-center gap-1.5 border border-white/20">
        <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        ¡Listo!
      </div>
    </div>
  )
}

interface Props {
  onComplete: () => void
}

export default function OnboardingCarousel({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  
  const DURATION = 5000 // 5 seconds per slide

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1)
            return 0
          } else {
            return 100
          }
        }
        return prev + (100 / (DURATION / 50))
      })
    }, 50)

    return () => clearInterval(timer)
  }, [currentStep])

  const next = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
      setProgress(0)
    } else {
      onComplete()
    }
  }

  const prev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      setProgress(0)
    }
  }

  const activeStep = STEPS[currentStep]

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0d14]/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 select-none">
      
      {/* Inject Keyframe Animations */}
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -80;
          }
        }
        @keyframes wiggle {
          0%, 100% { transform: translate(0px, 0px) rotate(-8deg); }
          50% { transform: translate(0px, 0px) rotate(8deg); }
        }
      `}</style>

      {/* Desktop mockup frame / Mobile edge-to-edge container */}
      <div className="w-full h-full sm:w-[390px] sm:h-[800px] sm:rounded-[48px] sm:border-8 sm:border-neutral-950 bg-[#1a1b2e] shadow-[0_32px_64px_rgba(0,0,0,0.5)] overflow-hidden relative flex flex-col">
        
        {/* Ambient Gradient Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[280px] h-[280px] bg-[#e8441a]/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[320px] h-[320px] bg-indigo-500/10 rounded-full blur-[90px] pointer-events-none" />

        {/* Top Progress Bars */}
        <div className="flex gap-1.5 px-6 pt-6 z-20">
          {STEPS.map((_, idx) => (
            <div key={idx} className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#e8441a]"
                initial={{ width: 0 }}
                animate={{ 
                  width: idx < currentStep ? '100%' : idx === currentStep ? `${progress}%` : '0%' 
                }}
                transition={{ ease: 'linear', duration: 0.05 }}
              />
            </div>
          ))}
        </div>

        {/* Header / Skip */}
        <div className="flex justify-between items-center px-6 pt-5 z-20">
          <div className="flex items-center gap-2">
            {/* Custom dynamically drawn TGO Logo */}
            <svg viewBox="0 0 100 100" className="w-6 h-6">
              <path d="M 50,15 A 35,35 0 1,1 81,35" fill="none" stroke="#f5f0e8" strokeWidth="10" strokeLinecap="round" />
              <circle cx="83" cy="27" r="8" fill="#e8441a" />
              <path d="M50 32 C56 32 60 37 60 43 C60 52 50 64 50 64 C50 64 40 52 40 43 C40 37 44 32 50 32 Z" fill="#e8441a" />
            </svg>
            <span className="text-[#f5f0e8] font-black text-sm tracking-widest">TGO</span>
          </div>
          <button 
            onClick={onComplete} 
            className="text-[#8b8fa8] hover:text-[#f5f0e8] font-bold text-xs uppercase tracking-wider transition-all py-1.5 px-3 rounded-xl hover:bg-white/5 active:scale-95"
          >
            Saltar
          </button>
        </div>

        {/* Slider Area */}
        <div className="flex-1 relative flex flex-col justify-center px-6 z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex flex-col items-center text-center"
            >
              {/* Central Illustration Area */}
              <div className="mb-8 relative">
                <div className="absolute -inset-4 rounded-full bg-[#e8441a]/5 blur-lg opacity-40" />
                {currentStep === 0 && <DiscoveryIllustration />}
                {currentStep === 1 && <RealTimePrepIllustration />}
                {currentStep === 2 && <DirectMenuIllustration />}
                {currentStep === 3 && <NotificationsIllustration />}
              </div>

              {/* Step Info */}
              <h2 className="text-2xl md:text-3xl font-black text-[#f5f0e8] mb-3.5 tracking-tight leading-tight px-4">
                {activeStep.title}
              </h2>
              <p className="text-[#8b8fa8] text-sm md:text-base font-medium leading-relaxed px-6 max-w-[320px]">
                {activeStep.description}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Tap Surfaces for Manual Navigation */}
          <div className="absolute inset-y-0 left-0 w-1/5 z-20 cursor-w-resize" onClick={prev} />
          <div className="absolute inset-y-0 right-0 w-1/5 z-20 cursor-e-resize" onClick={next} />
        </div>

        {/* Footer Actions */}
        <div className="p-6 pb-10 flex flex-col items-center z-20">
          {currentStep === STEPS.length - 1 ? (
            <button 
              onClick={onComplete}
              className="w-full h-12 rounded-2xl bg-[#e8441a] text-white font-black text-xs uppercase tracking-widest hover:brightness-110 active:scale-[0.96] active:translate-y-[0.5px] shadow-[0_12px_24px_-4px_rgba(232,68,26,0.4)] transition-all duration-100 ease-out flex items-center justify-center gap-1.5"
            >
              ¡Empezá ahora!
              <ChevronRight size={14} />
            </button>
          ) : (
            <button 
              onClick={next}
              className="w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-[#f5f0e8] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all duration-100 ease-out active:scale-[0.96] active:translate-y-[0.5px]"
            >
              Siguiente
              <ChevronRight size={14} />
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
