'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OnboardingData, ConocerteStep } from './constants'
import NameStage from './stages/NameStage'
import AgeStage from './stages/AgeStage'
import ZoneStage from './stages/ZoneStage'
import CuisineStage from './stages/CuisineStage'
import ExperienceStage from './stages/ExperienceStage'
import PrivacyStage from './stages/PrivacyStage'

interface OnboardingWizardProps {
  initialData: OnboardingData
  onComplete: (data: OnboardingData) => void
  onStepChange?: (step: number) => void
}

const STEPS: ConocerteStep[] = ['name', 'age', 'zone', 'cuisine', 'experience', 'privacy']

export default function OnboardingWizard({ initialData, onComplete, onStepChange }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState<OnboardingData>(initialData)

  const updateData = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1
      setCurrentStep(next)
      onStepChange?.(next)
    } else {
      onComplete(data)
    }
  }, [currentStep, data, onComplete, onStepChange])

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      const prev = currentStep - 1
      setCurrentStep(prev)
      onStepChange?.(prev)
    }
  }, [currentStep, onStepChange])

  const progress = ((currentStep + 1) / STEPS.length) * 100

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Progress bar */}
      <div className="relative h-[3px] w-full" style={{ backgroundColor: 'var(--tgo-border)' }}>
        <motion.div
          className="absolute left-0 top-0 h-full"
          style={{ backgroundColor: 'var(--tgo-state-action)' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Step counter */}
      <div className="flex items-center justify-between px-6 pt-4">
        <span className="text-xs font-medium" style={{ color: 'var(--tgo-text-muted)' }}>
          {currentStep + 1} de {STEPS.length}
        </span>
        {currentStep > 0 && (
          <button
            onClick={goBack}
            className="text-xs font-medium transition-colors duration-150"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            Atrás
          </button>
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {STEPS[currentStep] === 'name' && (
            <NameStage
              key="name"
              value={data.name}
              onChange={(name) => updateData({ name })}
              onNext={goNext}
            />
          )}
          {STEPS[currentStep] === 'age' && (
            <AgeStage
              key="age"
              value={data.age}
              onChange={(age) => updateData({ age })}
              onNext={goNext}
            />
          )}
          {STEPS[currentStep] === 'zone' && (
            <ZoneStage
              key="zone"
              value={data.zone}
              onChange={(zone) => updateData({ zone })}
              onNext={goNext}
            />
          )}
          {STEPS[currentStep] === 'cuisine' && (
            <CuisineStage
              key="cuisine"
              value={data.cuisinePreferences}
              onChange={(cuisinePreferences) => updateData({ cuisinePreferences })}
              onNext={goNext}
            />
          )}
          {STEPS[currentStep] === 'experience' && (
            <ExperienceStage
              key="experience"
              value={data.experiencePreferences}
              onChange={(experiencePreferences) => updateData({ experiencePreferences })}
              onNext={goNext}
            />
          )}
          {STEPS[currentStep] === 'privacy' && (
            <PrivacyStage key="privacy" onNext={goNext} />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
