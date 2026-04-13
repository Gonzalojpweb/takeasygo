'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Hide if already installed or dismissed in this session
    if (typeof window === 'undefined') return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (sessionStorage.getItem('pwa-dismissed')) return

    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show) return null

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShow(false)
    sessionStorage.setItem('pwa-dismissed', '1')
  }

  return (
    <div className="relative mx-4 mt-3 mb-1 rounded-2xl overflow-hidden animate-fade-in-up"
      style={{
        background: 'linear-gradient(135deg, rgba(241,71,34,0.12) 0%, rgba(16,185,129,0.06) 100%)',
        border: '1px solid rgba(241,71,34,0.15)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(241,71,34,0.15)' }}>
          <Download size={16} className="text-[#f14722]" />
        </div>
        <div className="flex-1 min-w-0">
          <AnimatedShinyText className="text-xs font-bold text-[#f7f4f2] inline-block">
            Instalá TakeasyGO
          </AnimatedShinyText>
          <p className="text-[#5a524d] text-[10px] leading-tight">
            Acceso rápido desde tu pantalla de inicio
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #f14722, #e03e1d)',
            color: 'white',
            boxShadow: '0 2px 10px rgba(241,71,34,0.3)',
          }}
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 text-[#5a524d] hover:text-[#8a7f7a] transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
