'use client'

import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import StackingFeatures from '@/components/landing/StackingFeatures'
import FeaturesDetail from '@/components/landing/FeaturesDetail'
import Pricing from '@/components/landing/Pricing'
import DemoSection from '@/components/landing/DemoSection'
import FAQ from '@/components/landing/FAQ'

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
        <DemoSection />
        <FAQ />
      </main>

      {/* Footer Minimalista */}
      <footer className="bg-white border-t border-zinc-100 px-10 py-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-base italic">T</span>
            </div>
            <span className="text-zinc-900 font-bold text-xl tracking-tight">Takeasygo</span>
          </div>

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