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

    // Log de visita al menú público via sendBeacon (fire-and-forget confiable).
    // 20/11: el origen (?source=, o el guardado en la sesión por SourceTracker),
    // la promo y de dónde llegó la persona van en el cuerpo: la URL del beacon
    // no los trae y su header Referer es esta misma página.
    const params = new URLSearchParams(window.location.search)
    let sessionSource: string | null = null
    try { sessionSource = sessionStorage.getItem('tgo_attribution_source') } catch { /* sin storage */ }
    const payload = JSON.stringify({
      tenantSlug,
      locationPath: window.location.pathname,
      source: params.get('source') || sessionSource || null,
      promo: params.get('promo') || null,
      referrer: document.referrer || null,
    })
    const blob = new Blob([payload], { type: 'application/json' })
    navigator.sendBeacon('/api/visits/log', blob)
  }, [tenantId, tenantSlug])

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
