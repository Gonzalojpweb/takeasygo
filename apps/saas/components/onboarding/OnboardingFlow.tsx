'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useSession } from 'next-auth/react'
import {
  OnboardingStep,
  OnboardingData,
  INITIAL_ONBOARDING_DATA,
  ConocerteStep,
} from './constants'
import WelcomeStage from './stages/WelcomeStage'
import OnboardingWizard from './OnboardingWizard'
import AuthStage from './stages/AuthStage'
import GreetingStage from './stages/GreetingStage'
import NotificationStage from './stages/NotificationStage'
import ManifestStage from './stages/ManifestStage'

interface OnboardingFlowProps {
  onComplete: () => void
}

const PENDING_DATA_KEY = 'tgo_onboarding_pending_data'
const PENDING_STEP_KEY = 'tgo_onboarding_pending_step'

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { data: session, status } = useSession()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const syncedRef = useRef(false)

  // ── Restore pending data from localStorage on mount ────────────────────
  useEffect(() => {
    try {
      const pendingData = localStorage.getItem(PENDING_DATA_KEY)
      const pendingStep = localStorage.getItem(PENDING_STEP_KEY) as OnboardingStep | null
      if (pendingData) {
        const parsed = JSON.parse(pendingData) as OnboardingData
        setData(parsed)
        // If we have pending data and a pending step, restore to that step
        // (user refreshed mid-onboarding after auth)
        if (pendingStep && pendingStep !== 'welcome' && pendingStep !== 'conocerte') {
          setCurrentStep(pendingStep)
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
        cuisinePreferences: parsed.cuisinePreferences,
        experiencePreferences: parsed.experiencePreferences,
      }),
    })
      .then(() => {
        localStorage.removeItem(PENDING_DATA_KEY)
        localStorage.removeItem(PENDING_STEP_KEY)
      })
      .catch((err) => console.error('[Onboarding] Error syncing pending data:', err))
      .finally(() => setIsSubmitting(false))
  }, [session, status])

  // ── Seed LocationContext with onboarding zone ──────────────────────────
  useEffect(() => {
    if (data.zone && data.zone !== 'ubicacion_actual') {
      // Only seed if no address is currently selected
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

  // ── Step handlers ──────────────────────────────────────────────────────
  const handleWelcomeComplete = useCallback(() => {
    goTo('conocerte')
  }, [goTo])

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
              cuisinePreferences: wizardData.cuisinePreferences,
              experiencePreferences: wizardData.experiencePreferences,
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
    // After auth, the page may redirect/reload. If it does,
    // OnboardingFlow will remount and detect session + pending data.
    // If it doesn't redirect (email magic link stays on page), advance directly.
    goTo('greeting')
  }, [goTo])

  const handleGreetingComplete = useCallback(() => {
    goTo('notifications')
  }, [goTo])

  const handleNotificationsComplete = useCallback(
    async (notificationPermission: 'granted' | 'denied') => {
      if (session?.user?.id) {
        try {
          await fetch('/api/user/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notificationPermission,
              onboardingCompleted: true,
            }),
          })
        } catch (error) {
          console.error('[Onboarding] Error saving notification pref:', error)
        }
      }

      goTo('manifest')
    },
    [session, goTo]
  )

  const handleManifestComplete = useCallback(() => {
    // Clean up any remaining pending data
    try {
      localStorage.removeItem(PENDING_DATA_KEY)
      localStorage.removeItem(PENDING_STEP_KEY)
    } catch {}
    onComplete()
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0d0b0a' }}
    >
      {/* Phone frame for desktop */}
      <div
        className="relative w-full h-full sm:w-[390px] sm:h-[844px] sm:rounded-[48px] sm:border sm:overflow-hidden sm:shadow-2xl"
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <AnimatePresence mode="wait">
          {currentStep === 'welcome' && (
            <WelcomeStage key="welcome" onComplete={handleWelcomeComplete} />
          )}

          {currentStep === 'conocerte' && (
            <OnboardingWizard
              key="conocerte"
              initialData={data}
              onComplete={handleWizardComplete}
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

          {currentStep === 'greeting' && (
            <GreetingStage
              key="greeting"
              userName={data.name || session?.user?.name || ''}
              onComplete={handleGreetingComplete}
            />
          )}

          {currentStep === 'notifications' && (
            <NotificationStage
              key="notifications"
              onComplete={handleNotificationsComplete}
            />
          )}

          {currentStep === 'manifest' && (
            <ManifestStage key="manifest" onComplete={handleManifestComplete} />
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
