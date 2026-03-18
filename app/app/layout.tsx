import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'TakeasyGO — Pedí takeaway sin filas',
  description: 'Encontrá restaurantes cercanos, pedí online y retirá listo. Takeaway rápido sin esperas.',
  openGraph: {
    title: 'TakeasyGO — Pedí takeaway sin filas',
    description: 'Encontrá restaurantes cercanos, pedí online y retirá listo.',
    images: ['/tgo192.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#065f46',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
