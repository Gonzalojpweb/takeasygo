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
        background: 'linear-gradient(135deg, var(--tgo-state-interactive-soft) 0%, var(--tgo-state-success-soft) 100%)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--tgo-state-interactive-soft)' }}>
          <Download size={16} style={{ color: 'var(--tgo-state-interactive)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <AnimatedShinyText className="text-xs font-black inline-block uppercase tracking-tight" style={{ color: 'var(--tgo-text-primary)' }}>
            Instalá TGO
          </AnimatedShinyText>
          <p className="text-[10px] font-medium leading-tight" style={{ color: 'var(--tgo-text-muted)' }}>
            Acceso rápido desde tu pantalla de inicio
          </p>
        </div>
        <button
          onClick={handleInstall}
          aria-label="Instalar TGO"
          className="shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, var(--tgo-state-interactive), var(--tgo-state-interactive-muted))',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Cerrar banner"
          className="shrink-0 p-1 transition-colors cursor-pointer"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
