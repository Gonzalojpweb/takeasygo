'use client'

import { cn } from '@/lib/utils'

interface Props {
  steps: string[]
  currentStep: number
}

export default function CheckoutStepper({ steps, currentStep }: Props) {
  if (steps.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto">
      {steps.map((label, i) => {
        const isActive = i === currentStep
        const isCompleted = i < currentStep

        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 transition-colors',
                  isCompleted && 'bg-zinc-900 text-white',
                  isActive && 'bg-zinc-900 text-white ring-2 ring-zinc-900/20',
                  !isActive && !isCompleted && 'bg-zinc-100 text-zinc-400',
                )}
              >
                {isCompleted ? '✓' : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap transition-colors',
                  (isActive || isCompleted) ? 'text-zinc-900' : 'text-zinc-400',
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'w-6 h-px shrink-0 transition-colors',
                  i < currentStep ? 'bg-zinc-900' : 'bg-zinc-200',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
