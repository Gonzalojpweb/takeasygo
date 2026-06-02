import type { Metadata, Viewport } from 'next'
import { TenantProvider, TenantRefCapture } from '@/contexts/TenantContext'
import { LocationProvider } from '@/components/explore/LocationContext'
import { Suspense } from 'react'

export const viewport: Viewport = {
  themeColor: '#10b981',
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
    <TenantProvider>
      <Suspense fallback={null}>
        <TenantRefCapture />
      </Suspense>
      <LocationProvider>
        <div className="consumer-dark min-h-screen bg-[#0d0b0a]">
          {children}
        </div>
      </LocationProvider>
    </TenantProvider>
  )
}

