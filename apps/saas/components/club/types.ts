'use client'

export type ClubStep =
  | 'welcome'
  | 'points'
  | 'reward-advance'
  | 'wallet'
  | 'form'
  | 'success'

export interface ClubFormData {
  name: string
  email: string
  phone: string
  countryCode: string
}

export interface ClubOnboardingProps {
  tenantSlug: string
  tenantLogo?: string
  promotionId: string
  title?: string
  ctaText?: string
  accentColor?: string
  isOpen: boolean
  onClose: () => void
  modalSubtitle?: string
  successTitle?: string
  successMessage?: string
  welcomePointsMsg?: string
}

export const INITIAL_FORM_DATA: ClubFormData = {
  name: '',
  email: '',
  phone: '',
  countryCode: '+54',
}

export const CLUB_STEPS: ClubStep[] = [
  'welcome',
  'points',
  'reward-advance',
  'wallet',
  'form',
  'success',
]
