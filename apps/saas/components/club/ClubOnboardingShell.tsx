'use client'

import { ReactNode } from 'react'
import Image from 'next/image'
import OnboardingProgress from './OnboardingProgress'

interface ClubOnboardingShellProps {
  tenantName: string
  tenantLogo?: string
  accentColor: string
  currentStep: number
  totalSteps: number
  onClose: () => void
  children: ReactNode
}

export default function ClubOnboardingShell({
  tenantName,
  tenantLogo,
  accentColor,
  currentStep,
  totalSteps,
  onClose,
  children,
}: ClubOnboardingShellProps) {
  return (
    <>
      {/* Backdrop — clicks here close the modal */}
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.48)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* Sheet — clicks here do NOT close the modal */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '92vh',
          borderTopLeftRadius: 'var(--tgo-radius-2xl, 24px)',
          borderTopRightRadius: 'var(--tgo-radius-2xl, 24px)',
          backgroundColor: 'var(--tgo-surface-0, #FFFFFF)',
          boxShadow: 'var(--tgo-elevation-dialog, 0 12px 40px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04))',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: 'var(--tgo-surface-3, #EDEAE6)' }}
          />
        </div>

        {/* Tenant header */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            {tenantLogo ? (
              <div
                className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${accentColor}10` }}
              >
                <Image
                  src={tenantLogo}
                  alt={tenantName}
                  width={28}
                  height={28}
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
              >
                {tenantName.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--tgo-text-primary, #1A1A1A)', fontFamily: 'var(--tgo-type-body-sm)' }}
            >
              {tenantName}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ color: 'var(--tgo-text-muted, #A09A95)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <OnboardingProgress
          current={currentStep}
          total={totalSteps}
          accentColor={accentColor}
        />

        {/* Step content */}
        <div
          className="flex-1 overflow-y-auto px-8 pt-6 pb-4"
          style={{ minHeight: 0 }}
        >
          {children}
        </div>
      </div>
    </>
  )
}
