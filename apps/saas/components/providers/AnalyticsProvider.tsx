'use client'

import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

// Init a module-scope (no en useEffect): los efectos de los hijos corren ANTES
// que los del padre, así que un capture en el mount (menu.opened) llegaría
// antes del init y posthog-js lo descartaría silenciosamente.
if (typeof window !== 'undefined' && !posthog.__loaded) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest',
    person_profiles: 'identified_only',
    capture_pageview: false,
  })
}

interface AnalyticsProviderProps {
  children: React.ReactNode
  tenantId: string
  tenantSlug: string
}

export function AnalyticsProvider({ children, tenantId, tenantSlug }: AnalyticsProviderProps) {
  useEffect(() => {
    posthog.register({
      tenantId,
      tenantSlug,
      owner: 'restaurant',
      actor: 'consumer',
      source: 'menu',
      product: 'consumer',
      version: '1.0',
    })

    // Log de visita al menú público via sendBeacon (fire-and-forget confiable)
    const payload = JSON.stringify({
      tenantSlug,
      locationPath: window.location.pathname,
    })
    const blob = new Blob([payload], { type: 'application/json' })
    navigator.sendBeacon('/api/visits/log', blob)
  }, [tenantId, tenantSlug])

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
