'use client'

import { useState, useEffect } from 'react'
import { X, Download, Share } from 'lucide-react'

interface Props {
  primaryColor: string
  bgColor: string
  textColor: string
  manifestUrl: string
}

export default function MenuPWAProvider({ primaryColor, bgColor, textColor, manifestUrl }: Props) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Inject <link rel="manifest"> if not already present in <head>
    // (fallback in case generateMetadata doesn't inject it server-side)
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = manifestUrl
      document.head.appendChild(link)
    }

    // Register the service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed silently — PWA features won't work but app still runs
      })
    }

    // Don't show banner if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Don't show if user already dismissed
    if (localStorage.getItem('pwa-dismissed')) return

    const ua = navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(ua) && !/chrome/.test(ua)

    if (ios) {
      setIsIOS(true)
      const timer = setTimeout(() => setShow(true), 4000)
      return () => clearTimeout(timer)
    }

    // Chrome / Android: wait for browser's install prompt
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const timer = setTimeout(() => setShow(true), 4000)
      return () => clearTimeout(timer)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    setShow(false)
    localStorage.setItem('pwa-dismissed', '1')
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-3 right-3 z-[60] max-w-sm mx-auto">
      <div
        className="rounded-2xl p-4 shadow-2xl"
        style={{
          backgroundColor: bgColor,
          border: `1.5px solid ${primaryColor}30`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.18)`,
        }}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: primaryColor + '18' }}>
            {isIOS
              ? <Share size={18} style={{ color: primaryColor }} />
              : <Download size={18} style={{ color: primaryColor }} />}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm" style={{ color: textColor }}>
              {isIOS ? 'Agregar al inicio' : 'Instalar el menú'}
            </p>
            {isIOS ? (
              <p className="text-xs mt-0.5" style={{ color: textColor, opacity: 0.55 }}>
                Tocá <strong>Compartir</strong>{' '}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle' }}>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                {' '}→ <strong>Añadir a inicio</strong>
              </p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: textColor, opacity: 0.55 }}>
                Accedé más rápido desde tu pantalla de inicio
              </p>
            )}
          </div>

          {/* Dismiss */}
          <button onClick={dismiss} style={{ color: textColor, opacity: 0.35 }} className="hover:opacity-60 flex-shrink-0 mt-0.5">
            <X size={16} />
          </button>
        </div>

        {/* Install button — only on Android/Chrome where we have the prompt */}
        {!isIOS && deferredPrompt && (
          <button
            onClick={install}
            className="w-full mt-3 py-2.5 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: primaryColor, color: '#ffffff' }}>
            Instalar app
          </button>
        )}
      </div>
    </div>
  )
}
