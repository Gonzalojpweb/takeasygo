'use client'

import { useState, useEffect } from 'react'
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

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] consumer-dark overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-card border-b border-[var(--c-border)]">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#f7f4f2] hover:bg-[var(--c-border)] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#f7f4f2]">Configuración</h1>
            <p className="text-xs text-[#5a524d]">Preferencias de tu cuenta</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-6">
        {/* Notificaciones */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5a524d] ml-1 mb-2">
            Notificaciones
          </h3>
          <div className="w-full glass-card rounded-2xl p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notifications ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--c-surface)] text-[#5a524d]'}`}>
              {notifications ? <Bell size={20} /> : <BellOff size={20} />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#f7f4f2]">Notificaciones Push</p>
              <p className="text-[10px] text-[#5a524d]">Recibí alertas cuando tu pedido esté listo</p>
            </div>
            <button
              onClick={toggleNotifications}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${notifications ? 'bg-emerald-500' : 'bg-[var(--c-border)]'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${notifications ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </section>

        {/* Información */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5a524d] ml-1 mb-2">
            Información
          </h3>

          <button
            onClick={() => router.push('/terminos')}
            className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-blue-500">
              <ExternalLink size={20} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-[#f7f4f2]">Términos y Condiciones</p>
              <p className="text-[10px] text-[#5a524d]">Uso de la plataforma</p>
            </div>
            <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => router.push('/privacidad')}
            className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all mt-2"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-purple-500">
              <ExternalLink size={20} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-[#f7f4f2]">Aviso de Privacidad</p>
              <p className="text-[10px] text-[#5a524d]">Protección de datos personales</p>
            </div>
            <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="w-full glass-card rounded-2xl p-4 mt-2">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#8a7f7a]">
                <span className="text-sm font-black">i</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#f7f4f2]">Información General</p>
                <p className="text-[10px] text-[#5a524d] leading-relaxed mt-1">
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
