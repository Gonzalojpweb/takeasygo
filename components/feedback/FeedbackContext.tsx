'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export type FeedbackVariant =
  | 'checkout_success'
  | 'checkout_error'
  | 'club_registered'
  | 'redeem_completed'
  | 'geofence_notified'

export interface FeedbackPayload {
  variant: FeedbackVariant
  metadata?: Record<string, any>
  clientHash?: string
}

interface FeedbackState {
  visible: boolean
  variant: FeedbackVariant
  metadata?: Record<string, any>
  clientHash?: string
}

interface FeedbackContextValue {
  show: (payload: FeedbackPayload) => void
  close: () => void
  state: FeedbackState
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

const RATE_LIMIT_KEY = 'tgo_feedback_log'
const RATE_LIMIT_DAYS = 7

function canShowFeedback(clientHash?: string): boolean {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_KEY)
    if (!raw) return true
    const log: string[] = JSON.parse(raw)
    const key = clientHash || 'anonymous'
    const cutoff = Date.now() - RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000
    const recent = log.filter(e => e.startsWith(key)).some(e => {
      const ts = parseInt(e.split(':')[1], 10)
      return ts > cutoff
    })
    return !recent
  } catch { return true }
}

function markFeedbackShown(clientHash?: string) {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_KEY)
    const log: string[] = raw ? JSON.parse(raw) : []
    log.push(`${clientHash || 'anonymous'}:${Date.now()}`)
    // Keep only last 20 entries to avoid bloat
    if (log.length > 20) log.splice(0, log.length - 20)
    sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(log))
  } catch { /* ignore */ }
}

export function FeedbackProvider({ children, tenantSlug }: { children: ReactNode; tenantSlug: string }) {
  const [state, setState] = useState<FeedbackState>({ visible: false, variant: 'checkout_success' })
  const lastShown = useRef(0)

  const show = useCallback((payload: FeedbackPayload) => {
    if (!canShowFeedback(payload.clientHash)) return
    // Debounce: ignore if shown in last 5 seconds
    if (Date.now() - lastShown.current < 5000) return
    lastShown.current = Date.now()
    setState({ visible: true, ...payload })
  }, [])

  const close = useCallback(() => {
    setState(prev => ({ ...prev, visible: false }))
    markFeedbackShown(state.clientHash)
  }, [state.clientHash])

  return (
    <FeedbackContext.Provider value={{ show, close, state }}>
      {children}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
