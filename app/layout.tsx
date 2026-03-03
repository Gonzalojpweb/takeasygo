import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import SmoothScroll from '@/components/SmoothScroll'
import NavigationProgress from '@/components/NavigationProgress'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Takeasygo | Premium Dining Tech',
  description: 'Infraestructura digital para la gastronomía',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={geist.className}>
        <NavigationProgress />
        <SmoothScroll>
          {children}
        </SmoothScroll>
        <Toaster />
      </body>
    </html>
  )
}