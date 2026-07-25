'use client'

import { useState, useEffect } from 'react'
import { microcopy } from '@/components/tgo/microcopy'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, BellOff, ChevronRight, ExternalLink } from 'lucide-react'
import BottomNav from '@/components/explore/BottomNav'

const STORAGE_KEY = 'tgo-notifications-enabled'

export default function SettingsClient() {
  const router = useRouter()
  const [notifications, setNotifications] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      setNotifications(stored === 'true')
    }
  }, [])

  function toggleNotifications() {
    const next = !notifications
    setNotifications(next)
    localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--tgo-radius-xl)',
    backgroundColor: 'var(--tgo-surface-card)',
    border: '1px solid var(--tgo-border)',
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-24"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--tgo-surface-0)',
          borderBottom: '1px solid var(--tgo-border)',
        }}
      >
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-surface-1)',
              color: 'var(--tgo-text-primary)',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
              {microcopy.settings.title}
            </h1>
            <p className="text-xs" style={{ color: 'var(--tgo-text-muted)' }}>
              {microcopy.settings.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-6">
        {/* Notificaciones */}
        <section>
          <h3
            className="ml-1 mb-2 uppercase tracking-widest"
            style={{ fontSize: 10, fontWeight: 900, color: 'var(--tgo-text-muted)' }}
          >
            {microcopy.settings.notifications}
          </h3>
          <div className="w-full p-4 flex items-center gap-4" style={cardStyle}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: notifications ? 'rgba(16, 185, 129, 0.1)' : 'var(--tgo-surface-1)',
                color: notifications ? 'var(--tgo-state-success)' : 'var(--tgo-text-muted)',
              }}
            >
              {notifications ? <Bell size={20} /> : <BellOff size={20} />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                {microcopy.settings.pushNotifications}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                {microcopy.settings.pushDescription}
              </p>
            </div>
            <button
              onClick={toggleNotifications}
              className="relative w-11 h-6 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: notifications ? 'var(--tgo-state-success)' : 'var(--tgo-border)',
              }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full shadow-md transition-transform duration-200"
                style={{
                  backgroundColor: 'var(--tgo-surface-card)',
                  transform: notifications ? 'translateX(22px)' : 'translateX(2px)',
                }}
              />
            </button>
          </div>
        </section>

        {/* Información */}
        <section>
          <h3
            className="ml-1 mb-2 uppercase tracking-widest"
            style={{ fontSize: 10, fontWeight: 900, color: 'var(--tgo-text-muted)' }}
          >
            {microcopy.settings.information}
          </h3>

          <button
            onClick={() => router.push('/terminos')}
            className="w-full p-4 flex items-center gap-4 group transition-all"
            style={{ ...cardStyle, borderRadius: 'var(--tgo-radius-xl)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--tgo-surface-1)', color: '#3b82f6' }}
            >
              <ExternalLink size={20} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                {microcopy.settings.terms}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                {microcopy.settings.termsSub}
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
          </button>

          <button
            onClick={() => router.push('/privacidad')}
            className="w-full p-4 flex items-center gap-4 group transition-all mt-2"
            style={{ ...cardStyle, borderRadius: 'var(--tgo-radius-xl)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--tgo-surface-1)', color: '#a855f7' }}
            >
              <ExternalLink size={20} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                {microcopy.settings.privacy}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                {microcopy.settings.privacySub}
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
          </button>

          <div className="w-full p-4 mt-2" style={cardStyle}>
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--tgo-surface-1)', color: 'var(--tgo-text-muted)' }}
              >
                <span className="text-sm font-black">i</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                  {microcopy.settings.generalInfo}
                </p>
                <p
                  className="text-[10px] leading-relaxed mt-1"
                  style={{ color: 'var(--tgo-text-muted)' }}
                >
                  TGO es la red de takeaway de TakeasyGO. Conectamos restaurantes con comensales
                  para que puedas pedir tu comida favorita de forma rápida y sencilla.
                  Sin comisiones abusivas, directo al local.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  )
}
