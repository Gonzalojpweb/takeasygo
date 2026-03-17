'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function getClientToken(): string {
  let token = localStorage.getItem('tgo-client-token')
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem('tgo-client-token', token)
  }
  return token
}

export default function PushSubscriber() {
  const [state, setState] = useState<'idle' | 'prompt' | 'subscribed' | 'denied'>('idle')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (sessionStorage.getItem('push-prompt-dismissed')) return

    // Registrar SW
    navigator.serviceWorker.register('/sw.js', { scope: '/' })

    const permission = Notification.permission
    if (permission === 'granted') {
      subscribeIfNeeded()
    } else if (permission === 'default') {
      // Mostrar el banner después de 3s para no abrumar al usuario
      const t = setTimeout(() => setState('prompt'), 3000)
      return () => clearTimeout(t)
    } else {
      setState('denied')
    }
  }, [])

  async function subscribeIfNeeded() {
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const clientToken = getClientToken()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientToken, subscription: sub.toJSON() }),
      })
      setState('subscribed')
    } catch {
      setState('denied')
    }
  }

  async function handleAllow() {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      await subscribeIfNeeded()
    } else {
      setState('denied')
      dismiss()
    }
  }

  function dismiss() {
    sessionStorage.setItem('push-prompt-dismissed', '1')
    setDismissed(true)
  }

  if (dismissed || state === 'idle' || state === 'subscribed' || state === 'denied') return null
  if (state !== 'prompt') return null

  return (
    <div className="flex items-center gap-3 bg-zinc-900 text-white px-4 py-2.5 shrink-0">
      <Bell size={16} className="text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight">¿Activás las notificaciones?</p>
        <p className="text-[11px] text-zinc-400 leading-tight">Te avisamos cuando tu pedido esté listo</p>
      </div>
      <button
        onClick={handleAllow}
        className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-colors">
        Activar
      </button>
      <button onClick={dismiss} className="text-zinc-500 hover:text-zinc-300">
        <X size={15} />
      </button>
    </div>
  )
}
