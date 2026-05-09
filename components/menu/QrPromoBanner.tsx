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
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[4px]"
          />

          {/* Banner Card */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden"
            style={{ borderRadius: styles.borderRadius || '32px' }}
          >
            {/* Close Button (X) */}
            <button 
              onClick={handleClose}
              className="absolute top-4 right-4 z-40 p-2 rounded-full bg-black/10 hover:bg-black/20 text-white transition-all backdrop-blur-md border border-white/20"
            >
              <X size={20} strokeWidth={3} />
            </button>

            {/* HEADER DUAL (ML Style) */}
            <div 
              className="h-56 sm:h-64 flex overflow-hidden relative"
              style={{ backgroundColor: accentColor }}
            >
              {/* Left Part: Image/Illustration */}
              <div className="w-1/2 relative p-4 flex items-center justify-center">
                <div className="relative w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white/20">
                  {promo.imageUrl ? (
                    <img 
                      src={promo.imageUrl} 
                      alt={promo.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center">
                       <div className="text-white opacity-80 scale-125">
                        {promo.type === 'discount' && <Gift size={64} strokeWidth={1.5} />}
                        {promo.type === 'loyalty' && <Star size={64} className="fill-white" />}
                        {promo.type === 'info' && <Info size={64} />}
                       </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Part: Promo Highlight */}
              <div className="w-1/2 flex flex-col justify-center pr-8 pl-2 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-2">
                  Solo por hoy
                </p>
                <div className="flex flex-col">
                  {promo.type === 'discount' ? (
                    <>
                      <div className="flex items-baseline leading-none">
                        <span className="text-5xl sm:text-6xl font-black tracking-tighter">
                          {promo.discountPercentage}%
                        </span>
                        <span className="text-2xl font-black ml-1">OFF</span>
                      </div>
                      <span className="text-[11px] font-black uppercase mt-1 tracking-widest bg-white/20 px-2 py-0.5 rounded-md inline-block w-fit">
                        Sin tope
                      </span>
                    </>
                  ) : (
                    <span className="text-3xl font-black leading-tight tracking-tight">
                      {promo.title}
                    </span>
                  )}
                </div>
              </div>

              {/* Subtly decorative background pattern */}
              <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                  <pattern id="pattern-circles" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="white" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#pattern-circles)" />
                </svg>
              </div>
            </div>

            {/* BODY SECTION */}
            <div className="p-10 sm:p-12 text-center">
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 leading-tight tracking-tight">
                {promo.title}
              </h3>
              <p className="text-base sm:text-lg text-slate-500 font-medium leading-snug mb-10 px-4">
                {promo.type === 'discount' 
                  ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                  : promo.subtitle}
              </p>

              {/* Loyalty Form */}
              {promo.type === 'loyalty' && !registered && (
                <form onSubmit={handleRegister} className="space-y-4 mb-10">
                  <input 
                    required
                    type="text"
                    placeholder="Nombre completo"
                    value={form.name}
                    onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-16 px-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold focus:border-blue-500/30 focus:ring-0 transition-all outline-none"
                  />
                  <div className="flex gap-2">
                    <select
                      value={form.countryCode}
                      onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                      className="h-16 w-24 px-2 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500/30 outline-none text-center"
                    >
                      <option value="+54">🇦🇷 +54</option>
                      <option value="+598">🇺🇾 +598</option>
                      <option value="+56">🇨🇱 +56</option>
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+51">🇵🇪 +51</option>
                      <option value="+52">🇲🇽 +52</option>
                      <option value="+1">🇺🇸 +1</option>
                    </select>
                    <input 
                      required
                      type="tel"
                      placeholder="WhatsApp"
                      value={form.phone}
                      onChange={e => setForm(s => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 h-16 px-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold focus:border-blue-500/30 outline-none"
                    />
                  </div>
                  {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-16 rounded-2xl text-white font-black text-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] transition-all active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: accentColor }}
                  >
                    {registering ? 'Cargando...' : promo.buttonText}
                  </button>
                </form>
              )}

              {/* Success Message */}
              {registered && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 p-8 bg-emerald-50 rounded-[2.5rem] mb-10 border-2 border-emerald-100"
                >
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="text-white" size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-emerald-900 text-xl">¡Perfecto!</p>
                    <p className="text-sm text-emerald-700 font-bold">Bienvenido al club de beneficios.</p>
                  </div>
                </motion.div>
              )}

              {/* ACTION BUTTONS (Non-loyalty or closed) */}
              {(promo.type !== 'loyalty' || registered) && (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={handleClose}
                    className="w-full h-16 rounded-2xl text-white font-black text-xl shadow-[0_15px_35px_-5px_rgba(0,0,0,0.2)] transition-all active:scale-95 flex items-center justify-center gap-3"
                    style={{ backgroundColor: accentColor }}
                  >
                    {promo.buttonText}
                    <ArrowRight size={24} strokeWidth={3} />
                  </button>
                  
                  <button
                    onClick={handleClose}
                    className="w-full h-12 rounded-xl text-blue-600 font-bold text-base hover:bg-blue-50 transition-all active:bg-blue-100"
                  >
                    Entendido
                  </button>
                </div>
              )}

              {promo.termsText && (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-10 leading-relaxed max-w-[280px] mx-auto">
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
