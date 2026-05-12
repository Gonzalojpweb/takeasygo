'use client'

import { useState, useEffect } from 'react'
import { X, ShoppingBag, Percent, ArrowRight, Star, CheckCircle2, Info, Sparkles, Gift } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface QrPromoData {
  isEnabled: boolean
  type: 'discount' | 'info' | 'loyalty'
  discountPercentage: number
  frequency: string
  title: string
  subtitle: string
  buttonText: string
  termsText: string
  imageUrl?: string
}

interface QrPromoStyles {
  primaryColor: string
  backgroundColor: string
  badgeColor: string
  borderRadius: string
  buttonColor: string
}

interface QrPromoBannerProps {
  tenantSlug: string
  source: string
}

export default function QrPromoBanner({ tenantSlug, source }: QrPromoBannerProps) {
  const [show, setShow] = useState(false)
  const [promo, setPromo] = useState<QrPromoData | null>(null)
  const [styles, setStyles] = useState<QrPromoStyles | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', countryCode: '+54' })
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([checkPromo(), fetchStyles()])
  }, [tenantSlug, source])

  const checkPromo = async () => {
    let effectiveSource = source
    if (!effectiveSource && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      const locationId = pathParts[3]
      if (locationId && locationId.length === 24) {
        effectiveSource = 'qr-auto'
      }
    }

    if (!effectiveSource || (!effectiveSource.toLowerCase().includes('qr') && effectiveSource !== 'qr-test')) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/${tenantSlug}/qr-promo?source=${source}`)
      const data = await res.json()
      
      if (data.show && data.promo) {
        setPromo(data.promo)
        setShow(true)
        if (data.promo.type === 'discount') {
          sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
            discountPercentage: data.promo.discountPercentage,
            tenantSlug
          }))
        }
      }
    } catch (e) {
      console.error('Error checking promo:', e)
    } finally {
      setLoading(false)
    }
  }

  const fetchStyles = async () => {
    try {
      const res = await fetch('/api/superadmin/qr-promo-defaults')
      const data = await res.json()
      if (data.qrPromoStyles) setStyles(data.qrPromoStyles)
    } catch (e) {
      setStyles({
        primaryColor: '#F74211',
        backgroundColor: '#FFFFFF',
        badgeColor: '#F74211',
        borderRadius: '32px',
        buttonColor: '#F74211',
      })
    }
  }

  const handleClose = () => {
    setShow(false)
    fetch(`/api/${tenantSlug}/qr-promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    })
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegistering(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, phone: `${form.countryCode} ${form.phone}`, source: 'qr_scan' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.code === 'ALREADY_REGISTERED' ? 'Ya estás registrado en el club.' : 'Error al registrarse')
        return
      }
      setRegistered(true)
      setTimeout(() => handleClose(), 2500)
    } catch (e) {
      setError('Error de conexión')
    } finally {
      setRegistering(false)
    }
  }

  if (loading || !show || !promo || !styles) return null

  const accentColor = styles.primaryColor || '#F74211'

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
          />

          {/* Banner Card */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="relative w-full max-w-[400px] bg-white shadow-2xl overflow-hidden border border-slate-100"
            style={{ borderRadius: styles.borderRadius || '24px' }}
          >
            {/* Close Button */}
            <button 
              onClick={handleClose}
              className="absolute top-3 right-3 z-50 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm border border-white/30 active:scale-90"
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            {/* HEADER INTEGRATED */}
            <div 
              className="h-44 sm:h-52 relative flex items-center justify-center overflow-hidden"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)` 
              }}
            >
              {/* Decorative background circles */}
              <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-2xl" />
              <div className="absolute bottom-[-10%] left-[-10%] w-32 h-32 bg-black/10 rounded-full blur-2xl" />

              <div className="relative flex items-center gap-6 px-6 w-full">
                {/* Image Container */}
                <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 relative">
                  <div className="absolute inset-0 bg-white/20 rounded-2xl blur-md" />
                  <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-white/40 shadow-lg bg-white/10">
                    {promo.imageUrl ? (
                      <img 
                        src={promo.imageUrl} 
                        alt={promo.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/90">
                        {promo.type === 'discount' && <Gift size={40} strokeWidth={1.5} />}
                        {promo.type === 'loyalty' && <Star size={40} className="fill-white" />}
                        {promo.type === 'info' && <Info size={40} />}
                      </div>
                    )}
                  </div>
                </div>

                {/* Promo Text Highlight */}
                <div className="flex flex-col text-white">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">
                    Solo por hoy
                  </p>
                  {promo.type === 'discount' ? (
                    <div className="flex flex-col">
                      <div className="flex items-baseline leading-none">
                        <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                          {promo.discountPercentage}%
                        </span>
                        <span className="text-xl font-bold ml-1">OFF</span>
                      </div>
                      <div className="mt-1 bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit">
                        Sin tope de reintegro
                      </div>
                    </div>
                  ) : (
                    <span className="text-2xl font-bold leading-tight tracking-tight">
                      {promo.title}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* BODY SECTION */}
            <div className="p-6 sm:p-8 text-center bg-white">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 leading-tight">
                {promo.title}
              </h3>
              <p className="text-sm sm:text-base text-slate-500 font-medium leading-relaxed mb-8 px-2">
                {promo.type === 'discount' 
                  ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                  : promo.subtitle}
              </p>

              {/* Loyalty Form */}
              {promo.type === 'loyalty' && !registered && (
                <form onSubmit={handleRegister} className="space-y-3 mb-8">
                  <input 
                    required
                    type="text"
                    placeholder="Nombre completo"
                    value={form.name}
                    onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500/30 focus:bg-white transition-all outline-none"
                  />
                  <div className="flex gap-2">
                    <select
                      value={form.countryCode}
                      onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                      className="h-12 w-20 px-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:border-blue-500/30 outline-none text-center"
                    >
                      <option value="+54">🇦🇷</option>
                      <option value="+598">🇺🇾</option>
                      <option value="+56">🇨🇱</option>
                      <option value="+55">🇧🇷</option>
                      <option value="+51">🇵🇪</option>
                      <option value="+52">🇲🇽</option>
                      <option value="+1">🇺🇸</option>
                    </select>
                    <input 
                      required
                      type="tel"
                      placeholder="WhatsApp"
                      value={form.phone}
                      onChange={e => setForm(s => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500/30 focus:bg-white outline-none"
                    />
                  </div>
                  {error && <p className="text-[10px] text-red-600 font-bold">{error}</p>}
                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-12 rounded-xl text-white font-bold text-base shadow-lg shadow-black/10 transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ backgroundColor: accentColor }}
                  >
                    {registering ? 'Procesando...' : promo.buttonText}
                  </button>
                </form>
              )}

              {/* Success Message */}
              {registered && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 p-6 bg-emerald-50 rounded-2xl mb-8 border border-emerald-100"
                >
                  <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 className="text-white" size={24} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-emerald-900 text-lg">¡Registro exitoso!</p>
                    <p className="text-xs text-emerald-700 font-medium">Bienvenido a nuestro club exclusivo.</p>
                  </div>
                </motion.div>
              )}

              {/* ACTION BUTTONS */}
              {(promo.type !== 'loyalty' || registered) && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleClose}
                    className="w-full h-12 rounded-xl text-white font-bold text-base shadow-lg shadow-black/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    style={{ backgroundColor: accentColor }}
                  >
                    {promo.buttonText}
                    <ArrowRight size={18} strokeWidth={2.5} />
                  </button>
                  
                  <button
                    onClick={handleClose}
                    className="w-full h-10 rounded-lg text-slate-400 font-semibold text-xs hover:text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cerrar ventana
                  </button>
                </div>
              )}

              {promo.termsText && (
                <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mt-8 leading-relaxed max-w-[240px] mx-auto">
                  {promo.termsText}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

}
