// ============================================================================
// takeasygo.com — página de inicio (rediseño 15/11/2026)
// ============================================================================
// Antes hablaba solo del menú y los pedidos, y estaba rota: el logo, las fotos
// y los videos devolvían 401 (cuenta de imágenes externa), las tipografías las
// bloqueaba la política de seguridad y el hero fijo tapaba secciones.
// Ahora presenta el sistema completo (venta online, POS, gestión, Premium y
// Élite) sin depender de recursos externos: logo y maquetas en código, y
// tipografías alojadas en el propio sitio.
// Orden: hero → plataforma → venta online → POS → gestión → Premium/Élite →
// planes → preguntas → demo → pie (con la transparencia de datos de Google).
// ============================================================================

import type { Metadata } from 'next'
import '@/components/landing/landing.css'
import { fontVars } from '@/components/landing/fonts'
import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import { CapabilityStrip, Ecosystem, OnlineFlow } from '@/components/landing/Platform'
import PosSection from '@/components/landing/PosSection'
import ManageSection from '@/components/landing/ManageSection'
import EliteSection from '@/components/landing/EliteSection'
import Pricing from '@/components/landing/Pricing'
import FAQ from '@/components/landing/FAQ'
import DemoSection from '@/components/landing/DemoSection'
import Footer from '@/components/landing/Footer'

const TITLE = 'TakeasyGO | Pedidos online, POS y gestión para restaurantes'
const DESCRIPTION =
  'Un solo sistema para tu local gastronómico: carta digital y pedidos online con tu marca, POS para el salón y la caja, inventario, club de clientes y reportes. Probalo gratis.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://www.takeasygo.com' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://www.takeasygo.com',
    siteName: 'TakeasyGO',
    locale: 'es_AR',
    type: 'website',
    images: [{ url: '/tgoicon-512.png', width: 512, height: 512, alt: 'TakeasyGO' }],
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION, images: ['/tgoicon-512.png'] },
}

export default function LandingPage() {
  return (
    <div className={`tgo-landing ${fontVars} min-h-screen selection:bg-[#f14722]/20`}>
      <Navbar />
      <main id="contenido">
        <Hero />
        <CapabilityStrip />
        <Ecosystem />
        <OnlineFlow />
        <PosSection />
        <ManageSection />
        <EliteSection />
        <Pricing />
        <FAQ />
        <DemoSection />
      </main>
      <Footer />
    </div>
  )
}
