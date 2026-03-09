'use client'

import Image from 'next/image'
import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import StackingFeatures from '@/components/landing/StackingFeatures'
import FeaturesDetail from '@/components/landing/FeaturesDetail'
import Pricing from '@/components/landing/Pricing'
import DemoSection from '@/components/landing/DemoSection'
import FAQ from '@/components/landing/FAQ'
import CTASection from '@/components/landing/CTASection'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-geist antialiased selection:bg-orange-500/10 selection:text-orange-600">
      <Navbar />

      <main>
        {/* Phase 1: Context & Vision */}
        <Hero />
        <HowItWorks />
        <StackingFeatures />

        {/* Phase 2: Details & Conversion */}
        <FeaturesDetail />
        <Pricing />
        <FAQ />
        <DemoSection />
        <CTASection />
      </main>

      {/* Footer Minimalista */}
      <footer className="bg-white border-t border-zinc-100 px-5 md:px-10 py-14 md:py-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">

          {/* Logo — click vuelve al inicio */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
            aria-label="Volver al inicio"
          >
            <Image
              src="https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772058968/logo_oolixg.png"
              alt="Takeasygo"
              width={160}
              height={40}
              style={{ height: 36, width: 'auto' }}
              unoptimized
            />
          </button>

          {/* Centro: botón volver arriba */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Volver arriba"
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center transition-all group-hover:border-zinc-900 group-hover:bg-zinc-900">
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className="text-zinc-400 group-hover:text-white transition-colors"
              >
                <path d="M7 11V3M3 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-300 group-hover:text-zinc-500 transition-colors">
              Inicio
            </span>
          </button>

          <div className="flex flex-col items-center md:items-end gap-3">
            <p className="text-zinc-400 font-bold text-[10px] tracking-[0.2em] uppercase">© 2026 Takeasygo - Sophisticated Dining Tech.</p>
            <div className="flex gap-8">
              <a href="mailto:hola@takeasygo.com" className="text-zinc-900 font-black text-xs hover:text-orange-500 transition-colors tracking-widest uppercase border-b-2 border-zinc-900 hover:border-orange-500">
                hola@takeasygo.com
              </a>
            </div>
          </div>

        </div>
      </footer>

    </div>
  )
}