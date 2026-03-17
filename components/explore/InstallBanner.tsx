'use client'

import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Ya está instalada como PWA — no mostrar
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // El usuario ya cerró el banner antes
    if (sessionStorage.getItem('pwa-banner-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as any)
    return () => window.removeEventListener('beforeinstallprompt', handler as any)
  }, [])

  if (!prompt || dismissed) return null

  function dismiss() {
    sessionStorage.setItem('pwa-banner-dismissed', '1')
    setDismissed(true)
  }

  async function install() {
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setDismissed(true)
    else dismiss()
  }

  return (
    <div className="flex items-center gap-3 bg-emerald-600 text-white px-4 py-2.5 shrink-0">
      <img src="/tgo192.png" alt="TakeasyGO" className="w-8 h-8 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight">Instalá TakeasyGO</p>
        <p className="text-[11px] text-emerald-100 leading-tight">Accedé rápido desde tu pantalla de inicio</p>
      </div>
      <button
        onClick={install}
        className="flex items-center gap-1 bg-white text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">
        <Download size={12} />
        Instalar
      </button>
      <button onClick={dismiss} className="text-emerald-200 hover:text-white">
        <X size={16} />
      </button>
    </div>
  )
}
