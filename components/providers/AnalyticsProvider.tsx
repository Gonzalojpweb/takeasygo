'use client'

import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

interface AnalyticsProviderProps {
  children: React.ReactNode
  tenantId: string
  tenantSlug: string
}

export function AnalyticsProvider({ children, tenantId, tenantSlug }: AnalyticsProviderProps) {
  useEffect(() => {
    if (!posthog.__loaded) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest',
        person_profiles: 'identified_only',
        capture_pageview: false,
      })
    }

    posthog.register({
      tenantId,
      tenantSlug,
      owner: 'restaurant',
      actor: 'consumer',
      source: 'menu',
      product: 'consumer',
      version: '1.0',
    })
  }, [tenantId, tenantSlug])

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
