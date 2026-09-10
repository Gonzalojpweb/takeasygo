'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSession } from 'next-auth/react'
import {
  OnboardingStep,
  OnboardingData,
  INITIAL_ONBOARDING_DATA,
} from './constants'
import AuthStage from './stages/AuthStage'
import OnboardingWizard from './OnboardingWizard'
import OnboardingMascot from './OnboardingMascot'
import type { MascotStep } from './OnboardingMascot'

interface OnboardingFlowProps {
  onComplete: () => void
}

const PENDING_DATA_KEY = 'tgo_onboarding_pending_data'
const PENDING_STEP_KEY = 'tgo_onboarding_pending_step'

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { data: session, status } = useSession()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('name')
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)
  const [hasGpsLocation, setHasGpsLocation] = useState(false)
  const syncedRef = useRef(false)

  // ── Restore pending data from localStorage on mount ────────────────────
  useEffect(() => {
    try {
      const pendingData = localStorage.getItem(PENDING_DATA_KEY)
      const pendingStep = localStorage.getItem(PENDING_STEP_KEY) as OnboardingStep | null
      if (pendingData) {
        const parsed = JSON.parse(pendingData) as OnboardingData
        setData(parsed)
        if (pendingStep && ['name', 'age', 'zone', 'auth'].includes(pendingStep)) {
          setCurrentStep(pendingStep)
        }
      }
    } catch {}
  }, [])

  // ── Check if GPS resolved a valid location ─────────────────────────────
  useEffect(() => {
    try {
      const address = localStorage.getItem('tgo-selected-address')
      if (address) {
        const parsed = JSON.parse(address)
        if (parsed?.coordinates?.lat && parsed?.coordinates?.lng) {
          setHasGpsLocation(true)
        }
      }
    } catch {}
  }, [])

  // ── Sync pending data to API once session is available ──────────────────
  useEffect(() => {
    if (syncedRef.current) return
    if (status !== 'authenticated' || !session?.user?.id) return

    const pendingData = localStorage.getItem(PENDING_DATA_KEY)
    if (!pendingData) return

    syncedRef.current = true
    const parsed = JSON.parse(pendingData) as OnboardingData

    setIsSubmitting(true)
    fetch('/api/user/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: parsed.name,
        age: parsed.age,
        zone: parsed.zone,
      }),
    })
      .then(() => {
        localStorage.removeItem(PENDING_DATA_KEY)
        localStorage.removeItem(PENDING_STEP_KEY)
      })
      .catch((err) => console.error('[Onboarding] Error syncing pending data:', err))
      .finally(() => setIsSubmitting(false))
  }, [session, status])

  // ── Auto-advance from auth → celebration if user is now authenticated ───
  useEffect(() => {
    if (status !== 'authenticated') return
    if (currentStep !== 'auth') return
    const timer = setTimeout(() => {
      triggerCelebration()
    }, 300)
    return () => clearTimeout(timer)
  }, [status, currentStep])

  // ── Seed LocationContext with onboarding zone ──────────────────────────
  useEffect(() => {
    if (data.zone && data.zone !== 'ubicacion_actual') {
      const existing = localStorage.getItem('tgo-selected-address')
      if (!existing) {
        const zoneAddress = {
          label: data.zone,
          address: data.zone + ', CABA, Buenos Aires, Argentina',
          city: 'Buenos Aires',
          coordinates: getBarrioCoords(data.zone),
          isDefault: true,
        }
        localStorage.setItem('tgo-selected-address', JSON.stringify(zoneAddress))
      }
    }
  }, [data.zone])

  const updateData = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  const goTo = useCallback((step: OnboardingStep) => {
    setCurrentStep(step)
  }, [])

  // ── Persist data to localStorage before auth redirect ──────────────────
  const persistBeforeAuth = useCallback(
    (step: OnboardingStep) => {
      try {
        localStorage.setItem(PENDING_DATA_KEY, JSON.stringify(data))
        localStorage.setItem(PENDING_STEP_KEY, step)
      } catch {}
    },
    [data]
  )

  // ── Celebration after auth ────────────────────────────────────────────
  const triggerCelebration = useCallback(() => {
    setShowCelebration(true)
    // Clean up pending data
    try {
      localStorage.removeItem(PENDING_DATA_KEY)
      localStorage.removeItem(PENDING_STEP_KEY)
    } catch {}
    // After celebration animation, complete onboarding
    setTimeout(() => {
      onComplete()
    }, 2500)
  }, [onComplete])

  // ── Step handlers ──────────────────────────────────────────────────────
  const handleWizardComplete = useCallback(
    async (wizardData: OnboardingData) => {
      updateData(wizardData)

      // Always persist to localStorage (survives auth redirect)
      try {
        localStorage.setItem(PENDING_DATA_KEY, JSON.stringify(wizardData))
        localStorage.setItem(PENDING_STEP_KEY, 'auth')
      } catch {}

      // If already authenticated, also save to API immediately
      if (session?.user?.id) {
        setIsSubmitting(true)
        try {
          await fetch('/api/user/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayName: wizardData.name,
              age: wizardData.age,
              zone: wizardData.zone,
            }),
          })
          localStorage.removeItem(PENDING_DATA_KEY)
          localStorage.removeItem(PENDING_STEP_KEY)
        } catch (error) {
          console.error('[Onboarding] Error saving preferences:', error)
        } finally {
          setIsSubmitting(false)
        }
      }

      goTo('auth')
    },
    [session, updateData, goTo]
  )

  const handleAuthComplete = useCallback(() => {
    // If already authenticated (e.g. Google redirect), advance to celebration
    if (status === 'authenticated') {
      triggerCelebration()
    }
    // Otherwise, the auto-advance effect will handle it
  }, [status, triggerCelebration])

  // ── Skip zone if GPS already resolved ─────────────────────────────────
  // The wizard handles name → age → zone. If GPS resolved, we skip zone
  // by having the wizard complete early (onStepChange callback detects zone)
  const handleWizardStepChange = useCallback(
    (step: number) => {
      setWizardStep(step)
      // Wizard STEPS: [name=0, age=1, zone=2]
      // If we're about to show zone (step 2) but GPS resolved, skip to auth
      if (step === 2 && hasGpsLocation) {
        // The wizard will call onComplete with current data
        // We need to trigger it programmatically — handled in OnboardingWizard
      }
    },
    [hasGpsLocation]
  )

  // ── Mascot logic ──────────────────────────────────────────────────────
  const showMascot = currentStep === 'name' || currentStep === 'age'
  const mascotStep: MascotStep = currentStep === 'name' ? 'name' : 'age'

  // ── Celebration screen ────────────────────────────────────────────────
  if (showCelebration) {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <div className="relative w-full h-full sm:w-[390px] sm:h-[844px] sm:rounded-[48px] sm:border sm:overflow-hidden sm:shadow-2xl"
          style={{
            maxWidth: '100vw',
            maxHeight: '100vh',
            borderColor: 'var(--tgo-border)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            {/* Confetti dots */}
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  opacity: 0,
                  x: 0,
                  y: -20,
                  scale: 0,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  x: (Math.random() - 0.5) * 300,
                  y: (Math.random() - 0.5) * 400,
                  scale: [0, 1, 0.5],
                  rotate: Math.random() * 360,
                }}
                transition={{
                  duration: 1.5,
                  delay: Math.random() * 0.3,
                  ease: 'easeOut',
                }}
                style={{
                  position: 'absolute',
                  width: 8,
                  height: 8,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  backgroundColor: [
                    'var(--tgo-brand-primary)',
                    '#12B76A',
                    '#3B82F6',
                    '#FAB300',
                    '#6C4CF0',
                  ][i % 5],
                }}
              />
            ))}

            {/* PuntoTGO happy */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, duration: 0.6, type: 'spring', bounce: 0.5 }}
              className="mb-8"
            >
              <svg viewBox="0 0 200 200" width="120" height="120">
                <defs>
                  <linearGradient id="celebBgGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--tgo-state-trust, #1c1d38)" />
                    <stop offset="100%" stopColor="#111225" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="200" height="200" rx="46" fill="url(#celebBgGrad)" />
                <path
                  d="M100,50 C118.5,50 133,64.5 133,83 C133,108 100,150 100,150 C100,150 67,108 67,83 C67,64.5 81.5,50 100,50 Z"
                  fill="var(--tgo-card, #f3eee2)"
                />
                <circle cx="100" cy="80" r="14" fill="var(--tgo-brand-primary, #f74211)" />
                {/* Smile arc */}
                <path
                  d="M90,85 Q100,95 110,85"
                  fill="none"
                  stroke="var(--tgo-card, #f3eee2)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>

            {/* Text */}
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-2xl font-bold tracking-tight mb-2 text-center"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              ¡Listo, {data.name || session?.user?.name?.split(' ')[0] || 'amigo'}!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.5 }}
              className="text-sm text-center leading-relaxed max-w-[280px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              Tu perfil está listo. Ahora vamos a descubrir juntos lugares increíbles cerca tuyo.
            </motion.p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Phone frame for desktop */}
      <div
        className="relative w-full h-full sm:w-[390px] sm:h-[844px] sm:rounded-[48px] sm:border sm:overflow-hidden sm:shadow-2xl"
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderColor: 'var(--tgo-border)',
        }}
      >
        {/* Mascot — visible during name and age */}
        {showMascot && <OnboardingMascot step={mascotStep} />}

        <AnimatePresence mode="wait">
          {currentStep === 'name' && (
            <OnboardingWizard
              key="onboarding"
              initialData={data}
              initialStep={0}
              hasGpsLocation={hasGpsLocation}
              onComplete={handleWizardComplete}
              onStepChange={handleWizardStepChange}
            />
          )}

          {currentStep === 'auth' && (
            <AuthStage
              key="auth"
              userName={data.name}
              onComplete={handleAuthComplete}
              onPersistData={() => persistBeforeAuth('auth')}
            />
          )}
        </AnimatePresence>

        {/* Submitting overlay */}
        {isSubmitting && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(13, 11, 10, 0.8)' }}
          >
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'rgba(247, 66, 17, 0.3)', borderTopColor: '#F74211' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Barrio coordinates (approximate centers for CABA) ───────────────────
function getBarrioCoords(barrio: string): { lat: number; lng: number } {
  const coords: Record<string, { lat: number; lng: number }> = {
    'Puerto Madero': { lat: -34.6175, lng: -58.3583 },
    'Retiro': { lat: -34.5893, lng: -58.3761 },
    'San Nicolás': { lat: -34.6033, lng: -58.3816 },
    'San Telmo': { lat: -34.6230, lng: -58.3700 },
    'Montserrat': { lat: -34.6200, lng: -58.3830 },
    'Constitución': { lat: -34.6330, lng: -58.3790 },
    'Barracas': { lat: -34.6440, lng: -58.3790 },
    'La Boca': { lat: -34.6340, lng: -58.3620 },
    'San Cristóbal': { lat: -34.6250, lng: -58.3930 },
    'Balvanera': { lat: -34.6100, lng: -58.3950 },
    'Once': { lat: -34.6030, lng: -58.4020 },
    'Villa Crespo': { lat: -34.5950, lng: -58.4130 },
    'Chacarita': { lat: -34.5870, lng: -58.4240 },
    'Palermo': { lat: -34.5780, lng: -58.4260 },
    'Recoleta': { lat: -34.5880, lng: -58.3970 },
    'Belgrano': { lat: -34.5600, lng: -58.4200 },
    'Núñez': { lat: -34.5440, lng: -58.4140 },
    'Villa Urquiza': { lat: -34.5520, lng: -58.4320 },
    'Villa Pueyrredón': { lat: -34.5580, lng: -58.4450 },
    'Caballito': { lat: -34.6180, lng: -58.4430 },
    'Villa Luro': { lat: -34.6330, lng: -58.4600 },
    'Vélez Sársfield': { lat: -34.6280, lng: -58.4530 },
    'Flores': { lat: -34.6300, lng: -58.4600 },
    'Floresta': { lat: -34.6230, lng: -58.4550 },
    'Liniers': { lat: -34.6390, lng: -58.5100 },
    'Mataderos': { lat: -34.6530, lng: -58.4760 },
    'Parque Avellaneda': { lat: -34.6460, lng: -58.4870 },
    'Villa Santa Rita': { lat: -34.6130, lng: -58.4600 },
    'Coghlan': { lat: -34.5550, lng: -58.4490 },
    'Saavedra': { lat: -34.5420, lng: -58.4570 },
    'Villa del Parque': { lat: -34.6010, lng: -58.4750 },
    'Villa Devoto': { lat: -34.5920, lng: -58.4840 },
    'Villa General Mitre': { lat: -34.6050, lng: -58.4620 },
    'Villa Lugano': { lat: -34.6650, lng: -58.4570 },
    'Villa Riachuelo': { lat: -34.6730, lng: -58.4390 },
    'Villa Soldati': { lat: -34.6660, lng: -58.4300 },
    'Villa Esperanza': { lat: -34.5700, lng: -58.4440 },
  }
  return coords[barrio] || { lat: -34.6037, lng: -58.3816 }
}
