'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import ClubOnboardingShell from './ClubOnboardingShell'
import WelcomeStep from './steps/WelcomeStep'
import PointsStep from './steps/PointsStep'
import RewardAdvanceStep from './steps/RewardAdvanceStep'
import WalletStep from './steps/WalletStep'
import FormStep from './steps/FormStep'
import SuccessStep from './steps/SuccessStep'
import { CLUB_STEPS, INITIAL_FORM_DATA } from './types'
import type { ClubStep, ClubFormData, ClubOnboardingProps } from './types'

export default function ClubOnboardingModal({
  tenantSlug,
  restaurantName,
  tenantLogo,
  promotionId,
  title,
  ctaText,
  accentColor = '#10b981',
  isOpen,
  onClose,
  modalSubtitle,
  successTitle,
  successMessage,
  welcomePointsMsg,
}: ClubOnboardingProps) {
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [formData, setFormData] = useState<ClubFormData>(INITIAL_FORM_DATA)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [welcomePointsAwarded, setWelcomePointsAwarded] = useState(0)

  useEffect(() => { setMounted(true) }, [])

  // Auto-fill from session or localStorage for existing users
  useEffect(() => {
    if (!isOpen) return

    if (session?.user?.name) {
      setFormData(prev => ({ ...prev, name: session.user!.name || '' }))
    }
    if (session?.user?.email) {
      setFormData(prev => ({ ...prev, email: session.user!.email || '' }))
    }

    if (!session?.user?.name) {
      try {
        const raw = localStorage.getItem(`tgo-customer-${tenantSlug}`)
        if (raw) {
          const data = JSON.parse(raw)
          if (data?.name) {
            setFormData(prev => ({ ...prev, name: data.name }))
          }
        }
      } catch { /* localStorage not available */ }
    }
  }, [isOpen, session, tenantSlug])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0)
      setDirection(1)
      setError('')
      setRegistering(false)
    }
  }, [isOpen])

  const tenantName = title || tenantSlug

  const goNext = useCallback(() => {
    if (currentStep < CLUB_STEPS.length - 1) {
      setDirection(1)
      setCurrentStep(prev => prev + 1)
    }
  }, [currentStep])

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1)
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const updateFormData = useCallback((partial: Partial<ClubFormData>) => {
    setFormData(prev => ({ ...prev, ...partial }))
  }, [])

  const handleSubmit = useCallback(async () => {
    setRegistering(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/loyalty-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: `${formData.countryCode} ${formData.phone}`,
          promotionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(
          data.code === 'ALREADY_REGISTERED'
            ? 'Ya estás registrado en el club.'
            : data.error || 'Error al registrarse'
        )
        return
      }

      const wp = data.welcomePoints || 0
      setWelcomePointsAwarded(wp)

      if (wp > 0) {
        toast(`🎉 Recibiste ${wp} puntos de bienvenida`, {
          description: 'Sumalos en cada pedido',
          duration: 4000,
        })
      }

      // Save membership to localStorage for menu badge
      try {
        localStorage.setItem(`club_${tenantSlug}`, JSON.stringify({
          name: formData.name,
          phone: `${formData.countryCode} ${formData.phone}`,
          points: wp,
          joinedAt: new Date().toISOString(),
        }))
      } catch { /* localStorage not available */ }

      goNext() // Go to success step
    } catch {
      setError('Error de conexión')
    } finally {
      setRegistering(false)
    }
  }, [formData, tenantSlug, promotionId, goNext])

  if (!mounted) return null

  const currentStepKey = CLUB_STEPS[currentStep]

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
    }),
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="club-onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 500 }}
        >
          <ClubOnboardingShell
            tenantName={tenantName}
            tenantLogo={tenantLogo}
            accentColor={accentColor}
            currentStep={currentStep}
            totalSteps={CLUB_STEPS.length}
            onClose={onClose}
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStepKey}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {currentStepKey === 'welcome' && (
                  <WelcomeStep
                    tenantName={tenantName}
                    tenantLogo={tenantLogo}
                    accentColor={accentColor}
                    onNext={goNext}
                  />
                )}

                {currentStepKey === 'points' && (
                  <PointsStep
                    accentColor={accentColor}
                    onNext={goNext}
                  />
                )}

                {currentStepKey === 'reward-advance' && (
                  <RewardAdvanceStep
                    accentColor={accentColor}
                    restaurantName={restaurantName || tenantName}
                    onNext={goNext}
                  />
                )}

                {currentStepKey === 'wallet' && (
                  <WalletStep
                    accentColor={accentColor}
                    ctaText={ctaText}
                    onNext={goNext}
                  />
                )}

                {currentStepKey === 'form' && (
                  <FormStep
                    formData={formData}
                    accentColor={accentColor}
                    ctaText={ctaText}
                    error={error}
                    registering={registering}
                    onChange={updateFormData}
                    onSubmit={handleSubmit}
                  />
                )}

                {currentStepKey === 'success' && (
                  <SuccessStep
                    tenantSlug={tenantSlug}
                    accentColor={accentColor}
                    welcomePoints={welcomePointsAwarded}
                    successTitle={successTitle}
                    successMessage={successMessage}
                    welcomePointsMsg={welcomePointsMsg}
                    onClose={onClose}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </ClubOnboardingShell>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
