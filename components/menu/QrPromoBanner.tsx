'use client'

import { useState, useEffect } from 'react'
import { X, ShoppingBag, Percent, ArrowRight, Star, CheckCircle2, Info, Sparkles } from 'lucide-react'
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
    // Iniciamos las peticiones en paralelo para máxima velocidad
    Promise.all([checkPromo(), fetchStyles()])
  }, [tenantSlug, source])

  const checkPromo = async () => {
    // DETECCIÓN AUTOMÁTICA: Si no hay source pero estamos en una mesa (locationId), asumimos QR
    let effectiveSource = source
    if (!effectiveSource && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      // Si el path es /[tenant]/menu/[locationId], el locationId es el 4to elemento (index 3)
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

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[2000] flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-6">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Banner Card */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 0.8 }}
            className="relative w-full max-w-lg bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl overflow-hidden"
            style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth > 640 ? styles.borderRadius : '32px 32px 0 0' }}
          >
            {/* Header / Handle on mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
            </div>

            {/* Close button desktop */}
            <button 
              onClick={handleClose}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors hidden sm:block"
            >
              <X size={20} className="text-gray-600" />
            </button>

            <div className="p-6 sm:p-10">
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                
                {/* Visual Section */}
                <div className="relative shrink-0 order-2 md:order-1">
                  <div 
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-[40px] rotate-6 flex items-center justify-center shadow-inner relative overflow-hidden"
                    style={{ backgroundColor: `${styles.primaryColor}15` }}
                  >
                    <motion.div
                      animate={{ rotate: [-2, 2, -2], scale: [1, 1.05, 1] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-2xl z-10"
                      style={{ backgroundColor: styles.primaryColor }}
                    >
                      {promo.type === 'discount' && <Percent size={40} className="text-white stroke-[3]" />}
                      {promo.type === 'loyalty' && <Star size={40} className="text-white fill-white" />}
                      {promo.type === 'info' && <Info size={40} className="text-white stroke-[3]" />}
                    </motion.div>
                    
                    {/* Decorative elements */}
                    <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-yellow-400 blur-[1px]" />
                    <div className="absolute bottom-4 right-2 w-6 h-6 rounded-full bg-blue-400 blur-[2px] opacity-20" />
                  </div>
                </div>

                {/* Content Section */}
                <div className="flex-1 text-center md:text-left order-1 md:order-2">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                    <span 
                      className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white"
                      style={{ backgroundColor: styles.primaryColor }}
                    >
                      {promo.type === 'discount' ? 'Oferta' : promo.type === 'loyalty' ? 'Club' : 'Aviso'}
                    </span>
                    {promo.type === 'loyalty' && (
                      <span className="flex items-center gap-1 text-amber-600 font-bold text-[10px] uppercase">
                        <Sparkles size={12} /> Beneficio Exclusivo
                      </span>
                    )}
                  </div>

                  <h2 className="text-3xl sm:text-4xl font-black text-slate-950 leading-[0.95] tracking-tight mb-4">
                    {promo.title}
                  </h2>
                  
                  <p className="text-base sm:text-lg text-slate-600 font-medium leading-tight mb-6">
                    {promo.type === 'discount' 
                      ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                      : promo.subtitle}
                  </p>

                  {/* Discount Big Badge (Only for Discount Type) */}
                  {promo.type === 'discount' && (
                    <div className="inline-block bg-slate-950 text-white rounded-2xl px-6 py-4 mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black tracking-tighter">-{promo.discountPercentage}%</span>
                        <span className="text-sm font-bold uppercase tracking-widest opacity-60">OFF</span>
                      </div>
                    </div>
                  )}

                  {/* Loyalty Form */}
                  {promo.type === 'loyalty' && !registered && (
                    <form onSubmit={handleRegister} className="space-y-3 mb-6">
                      <div className="grid grid-cols-1 gap-3">
                        <input 
                          required
                          type="text"
                          placeholder="Nombre completo"
                          value={form.name}
                          onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                          className="w-full h-14 px-5 bg-slate-100 border-none rounded-2xl text-base font-bold focus:ring-2 focus:ring-black/5 transition-all outline-none"
                        />
                        <div className="flex gap-2">
                          <select
                            value={form.countryCode}
                            onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                            className="h-14 w-[88px] px-2 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-black/5 transition-all outline-none text-center"
                          >
                            <option value="+54">🇦🇷 +54</option>
                            <option value="+598">🇺🇾 +598</option>
                            <option value="+56">🇨🇱 +56</option>
                            <option value="+55">🇧🇷 +55</option>
                            <option value="+51">🇵🇪 +51</option>
                            <option value="+52">🇲🇽 +52</option>
                            <option value="+1">🇺🇸 +1</option>
                            <option value="+34">🇪🇸 +34</option>
                            <option value="+44">🇬🇧 +44</option>
                            <option value="+49">🇩🇪 +49</option>
                            <option value="+33">🇫🇷 +33</option>
                            <option value="+39">🇮🇹 +39</option>
                          </select>
                          <input 
                            required
                            type="tel"
                            placeholder="Tu WhatsApp"
                            value={form.phone}
                            onChange={e => setForm(s => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))}
                            className="flex-1 h-14 px-5 bg-slate-100 border-none rounded-2xl text-base font-bold focus:ring-2 focus:ring-black/5 transition-all outline-none"
                          />
                        </div>
                      </div>
                      {error && <p className="text-xs text-red-600 font-bold text-center md:text-left">{error}</p>}
                      <button
                        type="submit"
                        disabled={registering}
                        className="w-full h-16 rounded-2xl text-white font-black text-xl shadow-xl transition-all active:scale-95 disabled:opacity-50"
                        style={{ backgroundColor: styles.buttonColor }}
                      >
                        {registering ? 'Procesando...' : promo.buttonText}
                      </button>
                    </form>
                  )}

                  {/* Success Message */}
                  {registered && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-4 p-6 bg-emerald-50 rounded-3xl mb-6 border border-emerald-100"
                    >
                      <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                        <CheckCircle2 className="text-white" />
                      </div>
                      <div>
                        <p className="font-black text-emerald-900 text-lg">¡Bienvenido al Club!</p>
                        <p className="text-sm text-emerald-700 font-medium">Ya podés disfrutar los beneficios.</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Standard Buttons (Non-loyalty or closed) */}
                  {(promo.type !== 'loyalty' || registered) && (
                    <button
                      onClick={handleClose}
                      className="w-full h-16 rounded-2xl text-white font-black text-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                      style={{ backgroundColor: styles.buttonColor }}
                    >
                      {promo.buttonText}
                      <ArrowRight size={24} className="stroke-[3]" />
                    </button>
                  )}

                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6 text-center md:text-left">
                    {promo.termsText}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
