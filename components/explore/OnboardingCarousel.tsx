'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, MapPin, Clock, ShoppingBag, Bell, X } from 'lucide-react'
import { ShimmerButton } from '@/components/ui/shimmer-button'

const STEPS = [
  {
    title: 'Descubrimiento',
    description: 'Encuentra los restaurantes más cercanos a tu ubicación que ofrecen Takeaway.',
    icon: MapPin,
    color: 'from-orange-500 to-[#f74211]',
  },
  {
    title: 'Tiempos Reales',
    description: 'Conoce los tiempos estimados de preparación y retiro en tiempo real.',
    icon: Clock,
    color: 'from-[#f74211] to-red-600',
  },
  {
    title: 'Compra Directa',
    description: 'Realiza tu compra directamente desde el menú digital del restaurante, sin intermediarios.',
    icon: ShoppingBag,
    color: 'from-red-600 to-rose-700',
  },
  {
    title: 'Notificaciones',
    description: 'Recibe una alerta cuando tu pedido esté listo para retirar. ¡Sin esperas!',
    icon: Bell,
    color: 'from-rose-700 to-purple-800',
  },
]

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
            // Stay at last slide if no auto-complete
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
    <div className="fixed inset-0 z-50 bg-[#0d0b0a] flex flex-col">
      {/* Top Progress Bars */}
      <div className="flex gap-1.5 px-4 pt-6">
        {STEPS.map((_, idx) => (
          <div key={idx} className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-white"
              initial={{ width: 0 }}
              animate={{ 
                width: idx < currentStep ? '100%' : idx === currentStep ? `${progress}%` : '0%' 
              }}
              transition={{ ease: 'linear', duration: 0.05 }}
            />
          </div>
        ))}
      </div>

      {/* Header / Close */}
      <div className="flex justify-between items-center px-6 pt-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#f74211] rounded-lg flex items-center justify-center">
            <span className="text-white font-serif italic font-bold">T</span>
          </div>
          <span className="text-white font-bold text-sm tracking-tight">Takeasygo</span>
        </div>
        <button onClick={onComplete} className="text-white/40 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`w-full max-w-sm aspect-[9/16] rounded-[40px] bg-gradient-to-br ${activeStep.color} p-10 flex flex-col items-center justify-center text-center shadow-2xl overflow-hidden relative`}
          >
            {/* Background elements */}
            <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute bottom-[-5%] left-[-5%] w-40 h-40 bg-black/10 rounded-full blur-3xl" />

            <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mb-8 border border-white/30">
              <activeStep.icon size={40} className="text-white" />
            </div>

            <h2 className="text-3xl font-black text-white mb-4 tracking-tight leading-tight">
              {activeStep.title}
            </h2>
            <p className="text-white/90 text-lg font-medium leading-relaxed">
              {activeStep.description}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Tap surfaces for manual navigation */}
        <div className="absolute inset-y-0 left-0 w-1/4 z-10" onClick={prev} />
        <div className="absolute inset-y-0 right-0 w-1/4 z-10" onClick={next} />
      </div>

      {/* Footer CTA */}
      <div className="p-8 pb-12 flex flex-col items-center">
        {currentStep === STEPS.length - 1 ? (
          <ShimmerButton 
            onClick={onComplete}
            className="w-full h-14 !bg-white !text-zinc-900 font-bold text-lg rounded-2xl"
          >
            ¡Empezar ahora!
          </ShimmerButton>
        ) : (
          <button 
            onClick={next}
            className="group flex items-center gap-3 text-white/60 hover:text-white transition-colors"
          >
            <span className="text-sm font-bold uppercase tracking-widest">Siguiente</span>
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#f74211]/20 group-hover:border-[#f74211]/30 transition-all">
              <ChevronRight size={20} />
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
