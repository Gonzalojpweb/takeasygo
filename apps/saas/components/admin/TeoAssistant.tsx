'use client'

// ── TeoAssistant ─────────────────────────────────────────────────────────────
//
// Widget flotante de TEO (TakeasyGO Expert Operator) en el panel admin.
// Presentación del asistente de soporte: muestra el saludo y avisa que el
// soporte 24/7 estará disponible próximamente. Todavía no es conversacional.
//
// Cuando el harness/LLM esté listo, este componente será el launcher del chat.
// Por ahora solo presenta al personaje con el mensaje de bienvenida.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'

const STORAGE_KEY = 'teo-assistant-dismissed'
const AUTO_OPEN_DELAY_MS = 1800

type Phase = 'hidden' | 'collapsed' | 'open'

export default function TeoAssistant() {
  const [phase, setPhase] = useState<Phase>('hidden')

  useEffect(() => {
    const wasDismissed = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
    const timer = setTimeout(() => {
      setPhase(wasDismissed ? 'collapsed' : 'open')
    }, wasDismissed ? 0 : AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setPhase('collapsed')
  }

  const handleReopen = () => {
    localStorage.removeItem(STORAGE_KEY)
    setPhase('open')
  }

  if (phase === 'hidden') return null

  if (phase === 'collapsed') {
    return (
      <button
        onClick={handleReopen}
        className="fixed bottom-6 right-6 z-50 group animate-in fade-in slide-in-from-bottom-2 duration-300"
        aria-label="Abrir asistente TEO"
        title="TEO — Tu asistente de soporte"
      >
        <div className="relative">
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/20 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/30 transition-all duration-300 bg-white">
            <Image
              src="/teo/TEO.png"
              alt="TEO"
              width={56}
              height={56}
              className="w-full h-full object-cover object-top scale-125 translate-y-0.5"
              priority={false}
            />
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative flex items-end gap-3">
        {/* Speech bubble / message card */}
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl rounded-br-md border border-border shadow-xl shadow-black/10 p-4 pr-8 max-w-[300px]">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X size={14} className="text-muted-foreground" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              TEO · Tu asistente
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-semibold text-foreground">
              ¡Hola! Soy TEO 👋
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Estoy acá para ayudarte a trabajar mejor con TakeasyGO.
            </p>
            <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Estoy por entrar en acción.</span>{' '}
                En los próximos días voy a acompañarte con tus dudas, configuraciones y la operación diaria — disponible 24/7.
              </p>
            </div>
            <p className="text-xs text-muted-foreground italic">
              Pronto vas a poder consultarme directamente desde acá.
            </p>
          </div>
        </div>

        {/* TEO character */}
        <button
          onClick={handleDismiss}
          className="relative shrink-0 group"
          aria-label="Cerrar TEO"
        >
          <div className="relative">
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background z-10 animate-pulse" />
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/15 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-primary/25 transition-all duration-300 bg-white animate-teo-float">
              <Image
                src="/teo/TEO.png"
                alt="TEO — TakeasyGO Expert Operator"
                width={80}
                height={80}
                className="w-full h-full object-cover object-top scale-125 translate-y-0.5"
                priority={false}
              />
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
