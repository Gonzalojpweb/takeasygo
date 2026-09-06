import type { Metadata, Viewport } from 'next'
import { TenantProvider, TenantRefCapture } from '@/contexts/TenantContext'
import { LocationProvider } from '@/components/explore/LocationContext'
import { Suspense } from 'react'
import ActiveOrderBanner from '@/components/menu/ActiveOrderBanner'

export const viewport: Viewport = {
  themeColor: '#E7E2E3',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'TGO — Takeaway cerca de vos',
  description: 'Descubrí restaurantes takeaway cerca de vos. Pedí en segundos.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TGO',
  },
  openGraph: {
    title: 'TGO — Takeaway cerca de vos',
    description: 'Descubrí restaurantes takeaway cerca de vos. Pedí en segundos.',
    type: 'website',
    images: ['/tgoicon-512.png'],
  },
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { background-color: var(--tgo-surface-0, #E7E2E3) !important; }
      `}</style>
    <TenantProvider>
      <Suspense fallback={null}>
        <TenantRefCapture />
      </Suspense>
      <LocationProvider>
        <Suspense fallback={null}>
          <ActiveOrderBanner />
        </Suspense>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
          {children}
        </div>
      </LocationProvider>
    </TenantProvider>
    </>
  )
}
