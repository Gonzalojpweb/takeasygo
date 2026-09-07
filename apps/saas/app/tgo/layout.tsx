import type { Metadata } from 'next'
import { Big_Shoulders, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-big-shoulders',
  display: 'swap',
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TGO — La ciudad de los 15 minutos',
  description: 'TGO mapea tu barrio en tiempo real: lo que está abierto ahora, lo que es confiable de verdad, y lo que tenés a menos de 15 minutos caminando.',
  openGraph: {
    title: 'TGO — La ciudad de los 15 minutos',
    description: 'Descubrí tu barrio en tiempo real.',
    type: 'website',
  },
}

export default function TgoLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${bigShoulders.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      data-tgo-landing
    >
      <body
        style={{
          fontFamily: 'var(--font-ibm-plex-sans), sans-serif',
          background: 'var(--tgo-paper)',
          color: 'var(--tgo-text-on-paper)',
          overflowX: 'hidden',
        }}
      >
        {children}
      </body>
    </html>
  )
}
