'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, CheckCircle2, Sparkles, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props {
  tenantSlug: string
  promotionId: string
  title: string
  ctaText?: string
  accentColor?: string
  isOpen: boolean
  onClose: () => void
}

export default function PromotionLoyaltyModal({
  tenantSlug,
  promotionId,
  title,
  ctaText,
  accentColor = '#10b981',
  isOpen,
  onClose,
}: Props) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', countryCode: '+54' })
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')
  const [understood, setUnderstood] = useState<'loading' | 'yes' | 'no' | null>(null)
  const [welcomePointsAwarded, setWelcomePointsAwarded] = useState(0)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRegistering(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/loyalty-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: `${form.countryCode} ${form.phone}`,
          promotionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.code === 'ALREADY_REGISTERED' ? 'Ya estás registrado en el club.' : data.error || 'Error al registrarse')
        return
      }
      setRegistered(true)
      const wp = data.welcomePoints || 0
      setWelcomePointsAwarded(wp)
      if (wp > 0) {
        toast(`🎉 Recibiste ${wp} puntos de bienvenida`, {
          description: 'Sumalos en cada pedido',
          duration: 4000,
        })
      }
      // Guardar membresía en localStorage para el badge del menú
      try {
        localStorage.setItem(`club_${tenantSlug}`, JSON.stringify({
          name: form.name,
          phone: `${form.countryCode} ${form.phone}`,
          points: wp,
          joinedAt: new Date().toISOString(),
        }))
      } catch { /* localStorage no disponible */ }
    } catch {
      setError('Error de conexión')
    } finally {
      setRegistering(false)
    }
  }

  async function sendClubFeedback(val: boolean) {
    setUnderstood(val ? 'yes' : 'no')
    await fetch(`/api/${tenantSlug}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'club_registered', understoodPoints: val }),
    }).catch(() => {})
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="relative w-full max-w-[380px] bg-white shadow-2xl overflow-hidden rounded-[28px]"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-50 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow-md text-slate-500 hover:text-slate-900 transition-all active:scale-90"
            >
              <X size={20} strokeWidth={3} />
            </button>

            <div
              className="h-48 relative flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${accentColor} 0%, #065f46 100%)`,
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(at_30%_20%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
              <div className="relative flex flex-col items-center text-center px-8">
                <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/30 mb-4">
                  <Star size={44} className="text-white fill-white" />
                </div>
              </div>
            </div>

            <div className="p-8 text-center">
              {!registered ? (
                <>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-500 text-sm mb-6">
                    Completá tus datos para unirte al club y comenzar a sumar puntos
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                      required
                      type="text"
                      placeholder="Nombre completo"
                      value={form.name}
                      onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                      className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:border-emerald-400 focus:bg-white transition-all outline-none"
                    />

                    <input
                      required
                      type="email"
                      placeholder="Correo electrónico"
                      value={form.email}
                      onChange={e => setForm(s => ({ ...s, email: e.target.value }))}
                      className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:border-emerald-400 outline-none"
                    />

                    <div className="flex gap-3">
                      <select
                        value={form.countryCode}
                        onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                        className="h-14 w-24 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:border-emerald-400 outline-none"
                      >
                        <option value="+54">🇦🇷 +54</option>
                        <option value="+598">🇺🇾 +598</option>
                        <option value="+56">🇨🇱 +56</option>
                        <option value="+55">🇧🇷 +55</option>
                      </select>

                      <input
                        required
                        type="tel"
                        placeholder="Número de WhatsApp"
                        value={form.phone}
                        onChange={e => setForm(s => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))}
                        className="flex-1 h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:border-emerald-400 outline-none"
                      />
                    </div>

                    {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

                    <button
                      type="submit"
                      disabled={registering}
                      className="w-full h-14 rounded-2xl text-white font-bold text-lg shadow-lg transition-all active:scale-[0.985] disabled:opacity-70"
                      style={{ backgroundColor: accentColor }}
                    >
                      {registering ? 'Procesando...' : ctaText || 'Unirme al Club'}
                    </button>
                  </form>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-8 px-6"
                >
                  <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  <p className="text-2xl font-bold text-emerald-900">¡Registro exitoso!</p>
                  <p className="text-emerald-700 mt-1">Bienvenido al club de fidelización</p>
                  {welcomePointsAwarded > 0 && (
                    <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
                      <Sparkles size={16} />
                      +{welcomePointsAwarded} puntos de bienvenida
                    </div>
                  )}

                  {/* CTA: Ir a billetera digital */}
                  <div className="mt-6 space-y-3">
                    <button
                      onClick={() => {
                        router.push(`/${tenantSlug}/club/lookup`)
                        onClose()
                      }}
                      className="w-full h-12 rounded-2xl text-white font-bold text-sm shadow-lg transition-all active:scale-[0.985] flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Wallet size={18} />
                      Ir a mi billetera
                    </button>
                    <button
                      onClick={onClose}
                      className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium transition-colors"
                    >
                      Ahora no
                    </button>
                  </div>

                  {understood === null && (
                    <div className="mt-6 space-y-3">
                      <p className="text-sm font-semibold text-slate-600">¿Entendés cómo acumulás puntos?</p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => sendClubFeedback(true)}
                          className={cn(
                            'px-6 py-2.5 rounded-xl font-bold text-sm border-2 transition-all',
                            'border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50'
                          )}
                        >
                          👍 Sí
                        </button>
                        <button
                          onClick={() => sendClubFeedback(false)}
                          className={cn(
                            'px-6 py-2.5 rounded-xl font-bold text-sm border-2 transition-all',
                            'border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50'
                          )}
                        >
                          👎 No
                        </button>
                      </div>
                    </div>
                  )}
                  {understood !== null && (
                    <p className="mt-6 text-sm font-medium text-emerald-600">
                      {understood === 'yes' ? '¡Genial! Sumá puntos en cada pedido.' : 'Consultá con el local cómo funcionan los puntos.'}
                    </p>
                  )}
                </motion.div>
              )}

              <button
                onClick={onClose}
                className="mt-6 text-sm text-slate-400 hover:text-slate-500 font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
