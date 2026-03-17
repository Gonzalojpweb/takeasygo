import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'TakeasyGO — Takeaway cerca de vos',
  description: 'Descubrí restaurantes takeaway cerca de vos. Pedí en segundos.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TakeasyGO',
  },
  openGraph: {
    title: 'TakeasyGO — Takeaway cerca de vos',
    description: 'Descubrí restaurantes takeaway cerca de vos. Pedí en segundos.',
    type: 'website',
    images: ['/real512.jpg'],
  },
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
