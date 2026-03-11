'use client'

import { Mail, MessageCircle, Instagram, Youtube, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

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
              src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png"
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

          <div className="flex flex-col items-center md:items-end gap-6 w-full md:w-auto">

            {/* Contact & Support Links */}
            <div className="flex flex-col items-center md:items-end gap-3">
              <a href="mailto:hola@takeasygo.com" className="flex items-center gap-2 text-zinc-900 font-black text-xs hover:text-orange-500 transition-colors tracking-widest uppercase pb-1 border-b-2 border-zinc-900 hover:border-orange-500">
                <Mail className="w-4 h-4" />
                hola@takeasygo.com
              </a>

              <a href="https://wa.me/5491138795976" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 hover:text-green-600 transition-colors text-xs font-semibold tracking-wide uppercase">
                <MessageCircle className="w-4 h-4" />
                Chatear con Comercial
              </a>

              <a href="https://wa.me/5491160019734" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 hover:text-green-600 transition-colors text-xs font-semibold tracking-wide uppercase">
                <MessageCircle className="w-4 h-4" />
                Atención al Cliente
              </a>
            </div>

            {/* Privacy & Legal */}
            <div className="flex flex-col items-center md:items-end gap-2 mt-2">
              <Link href="/privacidad" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-[10px] font-bold tracking-[0.1em] uppercase">
                <ShieldCheck className="w-3 h-3" />
                Políticas de Privacidad
              </Link>
            </div>

            {/* Consultora Click and think */}
            <div className="flex flex-col items-center md:items-end gap-2 pt-4 border-t border-zinc-100 max-w-xs text-center md:text-right">
              <span className="text-zinc-400 font-bold text-[9px] tracking-[0.1em] uppercase">
                Producto Exclusivo de la Consultora Click and Think
              </span>
              <div className="flex items-center gap-4 mt-1">
                <a href="https://instagram.com/clickandthinkai" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-pink-600 transition-colors flex items-center gap-1 text-[10px] font-bold tracking-wider">
                  <Instagram className="w-3 h-3" />
                  @takeasygo
                </a>
                <a href="https://www.youtube.com/watch?v=cJ05n7BUDfc" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-red-500 transition-colors flex items-center gap-1 text-[10px] font-bold tracking-wider">
                  <Youtube className="w-3 h-3" />
                  YouTube
                </a>
              </div>
            </div>

            <p className="text-zinc-300 font-bold text-[9px] tracking-[0.2em] uppercase mt-2">© 2026 Takeasygo - Sophisticated Dining Tech.</p>
          </div>

        </div>
      </footer>

    </div>
  )
}