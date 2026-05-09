import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Suspense } from 'react'
import { Toaster } from '@/components/ui/sonner'
import SmoothScroll from '@/components/SmoothScroll'
import NavigationProgress from '@/components/NavigationProgress'
import SourceTracker from '@/components/SourceTracker'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Takeasygo | Premium Dining Tech',
  description: 'Infraestructura digital para la gastronomía',
  icons: {
    icon: '/real192.jpg',
    apple: '/real192.jpg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={geist.className}>
        <AuthProvider>
          <Suspense fallback={null}>
            <SourceTracker />
          </Suspense>
          <NavigationProgress />
          <SmoothScroll>
            {children}
          </SmoothScroll>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}