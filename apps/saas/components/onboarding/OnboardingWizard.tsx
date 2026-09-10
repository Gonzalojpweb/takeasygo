'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OnboardingData, ConocerteStep } from './constants'
import NameStage from './stages/NameStage'
import AgeStage from './stages/AgeStage'
import ZoneStage from './stages/ZoneStage'

interface OnboardingWizardProps {
  initialData: OnboardingData
  initialStep?: number
  hasGpsLocation?: boolean
  onComplete: (data: OnboardingData) => void
  onStepChange?: (step: number) => void
}

const STEPS: ConocerteStep[] = ['name', 'age', 'zone']

export default function OnboardingWizard({
  initialData,
  initialStep = 0,
  hasGpsLocation = false,
  onComplete,
  onStepChange,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [data, setData] = useState<OnboardingData>(initialData)

  // Skip zone if GPS already resolved
  useEffect(() => {
    if (hasGpsLocation && currentStep === 2) {
      // Zone step — GPS resolved, skip to complete
      onComplete(data)
    }
  }, [hasGpsLocation, currentStep, data, onComplete])

  const updateData = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1
      // Skip zone if GPS resolved
      if (next === 2 && hasGpsLocation) {
        onComplete(data)
        return
      }
      setCurrentStep(next)
      onStepChange?.(next)
    } else {
      onComplete(data)
    }
  }, [currentStep, data, hasGpsLocation, onComplete, onStepChange])

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
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
