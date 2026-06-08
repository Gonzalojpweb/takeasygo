'use client'

import { useState, useEffect } from 'react'
import { X, Gift, Star, Info, CheckCircle2, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'

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
  badgeLabel?: string
  offLabel?: string
  takeawayWarningTitle?: string
  takeawayWarningText?: string
  loadingText?: string
  checkoutDiscountLabel?: string
}

interface LoyaltyMessaging {
  modalSubtitle?: string
  successTitle?: string
  successMessage?: string
  welcomePointsMsg?: string
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
}

export default function QrPromoBanner({ tenantSlug }: QrPromoBannerProps) {
  const searchParams = useSearchParams()
  const source = searchParams ? (searchParams.get('source') || '') : ''
  const promoSlug = searchParams ? (searchParams.get('promo') || '') : ''

  const [show, setShow] = useState(false)
  const [promo, setPromo] = useState<QrPromoData | null>(null)
  const [styles, setStyles] = useState<QrPromoStyles | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', phone: '', countryCode: '+54' })
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')
  const [loyaltyMsg, setLoyaltyMsg] = useState<LoyaltyMessaging | null>(null)

  useEffect(() => {
    Promise.all([checkPromo(), fetchStyles()])
  }, [tenantSlug, source, promoSlug])

  const checkPromo = async () => {
    let effectiveSource = source
    if (!effectiveSource && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      const locationId = pathParts[3]
      if (locationId && locationId.length === 24) {
        effectiveSource = 'qr-auto'
      }
    }

    if (!effectiveSource) {
      setLoading(false)
      return
    }

    try {
      const apiUrl = `/api/${tenantSlug}/qr-promo?source=${source}${promoSlug ? `&promo=${promoSlug}` : ''}`
      const res = await fetch(apiUrl)
      const data = await res.json()

      if (data.show && data.promo) {
        setPromo(data.promo)
        setShow(true)
        if (data.loyaltyMessaging) setLoyaltyMsg(data.loyaltyMessaging)
        if (data.promo.type === 'discount') {
          sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
            discountPercentage: data.promo.discountPercentage,
            tenantSlug,
            checkoutDiscountLabel: data.promo.checkoutDiscountLabel || 'Descuento QR',
            promoSlug: promoSlug || undefined,
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
      setStyles(data.qrPromoStyles || {
        primaryColor: '#F74211',
        backgroundColor: '#FFFFFF',
        badgeColor: '#F74211',
        borderRadius: '32px',
        buttonColor: '#F74211',
      })
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
        body: JSON.stringify({ name: form.name, email: form.email, phone: `${form.countryCode} ${form.phone}`, source: 'qr_scan' }),
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
  const accentColor = styles.primaryColor || '#f14722'
  const isDiscount = promo.type === 'discount'

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          {/* Backdrop with elegant dark blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-[390px] bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.24)] overflow-hidden border border-neutral-100"
            style={{ borderRadius: styles.borderRadius || '32px' }}
          >
            {/* Header: Visual Banner with premium mesh gradient */}
            <div
              className="h-28 relative overflow-hidden"
              style={{
                background: `radial-gradient(circle at 10% 20%, ${accentColor}dd 0%, transparent 60%), radial-gradient(circle at 90% 10%, #7c3aedcc 0%, transparent 70%), radial-gradient(circle at 50% 80%, #3b82f6cc 0%, #1e1b4b 100%)`
              }}
            >
              {/* Overlay glass ring noise */}
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_2px,transparent_3px)] bg-[size:12px_12px]" />
              
              {/* TGO Branding Logo in Top-Left Corner */}
              <div className="absolute top-4 left-5 flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 select-none">
                <img src="/tgoicon-192.png" alt="TGO Icon" className="w-4 h-4 object-contain" />
                <span className="text-[9px] font-black text-white tracking-[0.1em]">TAKEASYGO</span>
              </div>

              {/* Close Button - Top Right Corner */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/90 transition-all active:scale-90"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* Floating Overlap Icon/Logo */}
            <div className="absolute top-16 left-6 z-20">
              {promo.imageUrl ? (
                <div className="p-0.5 bg-white rounded-2xl shadow-md border border-neutral-100">
                  <img
                    src={promo.imageUrl}
                    alt={promo.title}
                    className="w-16 h-16 object-cover rounded-[14px]"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-white p-0.5 shadow-md border border-neutral-100 flex items-center justify-center">
                  <div 
                    className="w-full h-full rounded-[14px] flex items-center justify-center text-white shadow-inner"
                    style={{ backgroundColor: accentColor }}
                  >
                    {promo.type === 'discount' && <Gift size={26} />}
                    {promo.type === 'loyalty' && <Star size={26} className="fill-white" />}
                    {promo.type === 'info' && <Info size={26} />}
                  </div>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="pt-10 px-6 pb-6 text-left">
              {/* Badge Label */}
              <span 
                className="inline-block text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md mb-2.5"
                style={{ 
                  color: accentColor, 
                  backgroundColor: `${accentColor}12`
                }}
              >
                {promo.badgeLabel || 'Oferta Especial'}
              </span>

              {/* Title & Subtitle */}
              <div className="mb-4">
                <div className="flex flex-wrap items-baseline gap-2 mb-1.5">
                  <h3 className="text-xl font-black text-neutral-900 tracking-tight leading-tight">
                    {promo.title}
                  </h3>
                  {isDiscount && (
                    <span className="inline-flex items-center text-[10px] font-black bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      {promo.discountPercentage}% {promo.offLabel || 'OFF'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 leading-relaxed font-medium">
                  {isDiscount
                    ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                    : promo.subtitle}
                </p>
              </div>

              {/* Warnings & Exclusivity Notice */}
              {isDiscount && (
                <div className="mb-5 p-3.5 bg-amber-500/5 border border-amber-500/15 rounded-xl flex items-start gap-2.5">
                  <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-amber-800 font-extrabold text-[11px] uppercase tracking-wider">
                      {promo.takeawayWarningTitle || 'Exclusivo para retiro'}
                    </h4>
                    <p className="text-amber-700 text-xs mt-0.5 leading-normal font-medium">
                      {promo.takeawayWarningText || 'Válido únicamente para llevar.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Loyalty Registration Fields */}
              {promo.type === 'loyalty' && !registered && (
                <form onSubmit={handleRegister} className="space-y-3 mb-5">
                  <input
                    required
                    type="text"
                    placeholder="Nombre completo"
                    value={form.name}
                    onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-11 px-3.5 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-xs transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 font-medium"
                  />

                  <input
                    required
                    type="email"
                    placeholder="Correo electrónico"
                    value={form.email}
                    onChange={e => setForm(s => ({ ...s, email: e.target.value }))}
                    className="w-full h-11 px-3.5 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-xs transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 font-medium"
                  />
                  
                  <div className="flex gap-2">
                    <div className="relative">
                      <select
                        value={form.countryCode}
                        onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                        className="h-11 px-3 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-xs font-bold transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 appearance-none pr-8 cursor-pointer"
                      >
                        <option value="+54">🇦🇷 +54</option>
                        <option value="+598">🇺🇾 +598</option>
                        <option value="+56">🇨🇱 +56</option>
                        <option value="+55">🇧🇷 +55</option>
                      </select>
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                        <svg className="w-3 h-3 fill-none stroke-current" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    <input
                      required
                      type="tel"
                      placeholder="Número de WhatsApp"
                      value={form.phone}
                      onChange={e => setForm(s => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 h-11 px-3.5 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-xs transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 font-medium"
                    />
                  </div>

                  {error && <p className="text-red-600 text-xs font-bold text-center mt-1">{error}</p>}

                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-11 rounded-xl text-white font-bold text-xs uppercase tracking-widest transition-all duration-100 ease-out active:scale-[0.96] active:translate-y-[0.5px] disabled:opacity-70 disabled:pointer-events-none hover:brightness-105"
                    style={{ 
                      backgroundColor: accentColor,
                      boxShadow: `0 10px 20px -4px ${accentColor}40`
                    }}
                  >
                    {registering ? (promo.loadingText || 'Procesando...') : promo.buttonText}
                  </button>
                </form>
              )}

              {/* Loyalty Registration Success State */}
              {registered && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-4 px-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl mb-5 text-left flex items-start gap-3"
                >
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/10">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-950">{loyaltyMsg?.successTitle || '¡Registro exitoso!'}</h4>
                    <p className="text-emerald-700 text-xs mt-0.5 font-medium leading-relaxed">{loyaltyMsg?.successMessage || 'Ya formas parte del club'}</p>
                  </div>
                </motion.div>
              )}

              {/* Primary CTA Button (For info or discount, or success state) */}
              {(promo.type !== 'loyalty' || registered) && (
                <button
                  onClick={handleClose}
                  className="w-full h-11 rounded-xl text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all duration-100 ease-out active:scale-[0.96] active:translate-y-[0.5px] hover:brightness-105"
                  style={{ 
                    backgroundColor: accentColor,
                    boxShadow: `0 10px 20px -4px ${accentColor}40`
                  }}
                >
                  {promo.buttonText}
                  <ArrowRight size={14} />
                </button>
              )}

              {/* Secondary Close Underlined Text Link */}
              <div className="text-center mt-4">
                <button
                  onClick={handleClose}
                  className="text-xs text-neutral-400 hover:text-neutral-600 font-bold uppercase tracking-wider transition-colors underline underline-offset-4"
                >
                  Seguir navegando
                </button>
              </div>

              {/* Fineprint Terms */}
              {promo.termsText && (
                <p className="text-[9px] text-neutral-400 mt-5 leading-relaxed border-t border-neutral-100 pt-3">
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