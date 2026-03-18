'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowRight, CheckCircle2, MapPin } from 'lucide-react'

const CUISINE_OPTIONS = [
  'Pizza', 'Sushi', 'Burger', 'Mexicano', 'Saludable',
  'Pasta', 'Pollo', 'Carnes', 'Árabe', 'Vegano',
  'Empanadas', 'Sandwiches', 'Helados', 'Café', 'Otro',
]

type FormState = 'idle' | 'loading' | 'success' | 'error' | 'duplicate'

interface Props {
  onClose: () => void
}

export default function SelfReportModal({ onClose }: Props) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    openingHours: '',
  })
  const [cuisineTypes, setCuisineTypes] = useState<string[]>([])
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [mounted, setMounted] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const t = setTimeout(() => firstInputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (state !== 'success') return
    const t = setTimeout(onClose, 3200)
    return () => clearTimeout(t)
  }, [state, onClose])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function toggleCuisine(c: string) {
    setCuisineTypes(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/directory/self-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cuisineTypes }),
      })
      const data = await res.json()

      if (res.status === 409) {
        setState('duplicate')
        return
      }
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al enviar. Intentá de nuevo.')
        setState('error')
        return
      }
      setState('success')
    } catch {
      setErrorMsg('Error de conexión. Intentá de nuevo.')
      setState('error')
    }
  }

  if (!mounted) return null

  const content = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: 'srm-fade-in 0.2s ease both',
        }}
      />

      <style>{`
        @keyframes srm-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes srm-slide-up { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      {/* Centering wrapper */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, pointerEvents: 'none',
        }}
      >
        {/* Card */}
        <div
          style={{
            pointerEvents: 'all',
            position: 'relative',
            width: '100%', maxWidth: 480,
            maxHeight: 'calc(100dvh - 32px)',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 24,
            padding: 'clamp(24px, 5vw, 40px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.16)',
            animation: 'srm-slide-up 0.35s cubic-bezier(0.22,1,0.36,1) both',
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-400 hover:border-emerald-500 hover:text-emerald-600 transition-colors"
          >
            <X size={13} />
          </button>

          {state === 'success' ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-zinc-900 mb-2">¡Registrado!</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Recibimos los datos de tu restaurante. El equipo de TakeasyGO se va a contactar con vos pronto.
              </p>
            </div>
          ) : state === 'duplicate' ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <MapPin size={22} className="text-amber-500" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Ya está registrado</h3>
              <p className="text-sm text-zinc-500 leading-relaxed mb-4">
                Encontramos un restaurante con ese nombre y dirección en nuestro directorio. Ya lo tenemos en el radar.
              </p>
              <button
                onClick={onClose}
                className="text-sm font-semibold text-emerald-600 hover:underline"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                  Directorio TakeasyGO
                </span>
              </div>
              <h3 className="text-2xl font-bold text-zinc-900 mb-1">Registrá tu restaurante</h3>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Completá los datos y te sumamos al mapa. El equipo se contacta para darte acceso completo a la red.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nombre */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                    Nombre del restaurante *
                  </label>
                  <input
                    ref={firstInputRef}
                    type="text"
                    required
                    placeholder="Ej: La Trattoria"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    disabled={state === 'loading'}
                    className="w-full border-b border-zinc-200 focus:border-emerald-500 outline-none py-2 text-sm text-zinc-900 placeholder:text-zinc-300 transition-colors bg-transparent"
                  />
                </div>

                {/* Dirección */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                    Dirección *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Av. Corrientes 1234, CABA"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    disabled={state === 'loading'}
                    className="w-full border-b border-zinc-200 focus:border-emerald-500 outline-none py-2 text-sm text-zinc-900 placeholder:text-zinc-300 transition-colors bg-transparent"
                  />
                </div>

                {/* Teléfono + horario en grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      placeholder="+54 9 11..."
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      disabled={state === 'loading'}
                      className="w-full border-b border-zinc-200 focus:border-emerald-500 outline-none py-2 text-sm text-zinc-900 placeholder:text-zinc-300 transition-colors bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                      Horario
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Lun-Vie 12-23hs"
                      value={form.openingHours}
                      onChange={e => setForm(f => ({ ...f, openingHours: e.target.value }))}
                      disabled={state === 'loading'}
                      className="w-full border-b border-zinc-200 focus:border-emerald-500 outline-none py-2 text-sm text-zinc-900 placeholder:text-zinc-300 transition-colors bg-transparent"
                    />
                  </div>
                </div>

                {/* Tipo de cocina */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                    Tipo de cocina
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {CUISINE_OPTIONS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCuisine(c.toLowerCase())}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          cuisineTypes.includes(c.toLowerCase())
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {state === 'error' && (
                  <p className="text-xs text-red-500">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={state === 'loading'}
                  className="w-full h-12 rounded-full bg-zinc-900 hover:bg-emerald-600 disabled:bg-zinc-300 text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors mt-2"
                >
                  {state === 'loading'
                    ? 'Enviando…'
                    : <><span>Registrar restaurante</span><ArrowRight size={13} /></>
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(content, document.body)
}
