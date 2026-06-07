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
          {/* Backdrop with a premium dark blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-[400px] bg-[var(--c-bg,rgba(255,255,255,0.98))] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] overflow-hidden border border-white/10"
            style={{ borderRadius: styles.borderRadius || '32px' }}
          >
            {/* Close Button - Premium Glassmorphism style */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md text-white/85 hover:text-white transition-all active:scale-90"
            >
              <X size={16} strokeWidth={2.5} />
            </button>

            {/* Header: Visual Branding & Accent */}
            <div
              className="h-48 relative flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${accentColor} 0%, #121214 100%)`
              }}
            >
              {/* Decorative background grid/mesh */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
              <div className="absolute inset-0 bg-black/10" />

              <div className="relative flex flex-col items-center text-center px-6 pt-4">
                {promo.imageUrl ? (
                  <div className="relative group mb-3.5">
                    <div className="absolute -inset-0.5 bg-white/20 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000" />
                    <img
                      src={promo.imageUrl}
                      alt={promo.title}
                      className="relative w-20 h-20 object-cover rounded-2xl shadow-lg border border-white/20"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 mb-3.5 shadow-lg">
                    {promo.type === 'discount' && <Gift size={40} className="text-white" />}
                    {promo.type === 'loyalty' && <Star size={40} className="text-white fill-white" />}
                    {promo.type === 'info' && <Info size={40} className="text-white" />}
                  </div>
                )}

                <span className="text-[10px] text-white/85 font-black tracking-[0.2em] uppercase bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10 mb-2">
                  {promo.badgeLabel || 'EXCLUSIVO'}
                </span>

                {isDiscount && (
                  <div className="flex items-baseline justify-center gap-0.5 text-white">
                    <span className="text-5xl font-black tracking-tighter">{promo.discountPercentage}</span>
                    <span className="text-3xl font-extrabold -mt-1">%</span>
                    <span className="text-2xl font-bold opacity-90 ml-1.5">{promo.offLabel || 'OFF'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-6 md:p-8">
              {/* Title & Subtitle */}
              <div className="text-center mb-6">
                <h3 className="text-xl md:text-2xl font-black tracking-tight text-neutral-900 leading-tight mb-2">
                  {promo.title}
                </h3>
                <p className="text-sm text-neutral-500 font-medium leading-relaxed px-2">
                  {isDiscount
                    ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                    : promo.subtitle}
                </p>
              </div>

              {/* Warning/Info Box for takeaway discount */}
              {isDiscount && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-left">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0 animate-pulse" />
                  <div>
                    <h4 className="text-amber-800 font-bold text-xs uppercase tracking-wider">
                      {promo.takeawayWarningTitle || 'Descuento para retirar'}
                    </h4>
                    <p className="text-amber-700 text-xs mt-0.5 leading-normal">
                      {promo.takeawayWarningText || 'Válido exclusivamente para pedidos con retiro en local.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Loyalty Program Registration Form */}
              {promo.type === 'loyalty' && !registered && (
                <form onSubmit={handleRegister} className="space-y-3.5 mb-6">
                  <div className="relative">
                    <input
                      required
                      type="text"
                      placeholder="Nombre completo"
                      value={form.name}
                      onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                      className="w-full h-12 px-4 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-sm transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 font-medium"
                    />
                  </div>

                  <div className="relative">
                    <input
                      required
                      type="email"
                      placeholder="Correo electrónico"
                      value={form.email}
                      onChange={e => setForm(s => ({ ...s, email: e.target.value }))}
                      className="w-full h-12 px-4 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-sm transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 font-medium"
                    />
                  </div>
                  
                  <div className="flex gap-2.5">
                    <div className="relative">
                      <select
                        value={form.countryCode}
                        onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                        className="h-12 px-3 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-sm font-semibold transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 appearance-none pr-8 cursor-pointer"
                      >
                        <option value="+54">🇦🇷 +54</option>
                        <option value="+598">🇺🇾 +598</option>
                        <option value="+56">🇨🇱 +56</option>
                        <option value="+55">🇧🇷 +55</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                        <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    <input
                      required
                      type="tel"
                      placeholder="Número de WhatsApp"
                      value={form.phone}
                      onChange={e => setForm(s => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 h-12 px-4 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 rounded-xl text-sm transition-all outline-none focus:bg-white focus:ring-4 focus:ring-neutral-900/5 font-medium"
                    />
                  </div>

                  {error && <p className="text-red-600 text-xs font-semibold text-center">{error}</p>}

                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-12 rounded-xl text-white font-bold text-xs uppercase tracking-widest transition-all duration-100 ease-out active:scale-[0.97] active:shadow-inner disabled:opacity-70 disabled:pointer-events-none shadow-lg shadow-neutral-950/10 hover:brightness-105"
                    style={{ backgroundColor: accentColor }}
                  >
                    {registering ? (promo.loadingText || 'Procesando...') : promo.buttonText}
                  </button>
                </form>
              )}

              {/* Success State */}
              {registered && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-6 px-4 bg-emerald-50 border border-emerald-100 rounded-2xl mb-6 text-center"
                >
                  <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md shadow-emerald-500/20">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-lg font-black text-emerald-950">{loyaltyMsg?.successTitle || '¡Registro exitoso!'}</h4>
                  <p className="text-emerald-700 text-xs mt-1 font-medium">{loyaltyMsg?.successMessage || 'Bienvenido al club'}</p>
                </motion.div>
              )}

              {/* Main Action Button for non-loyalty promos or registered loyalty */}
              {(promo.type !== 'loyalty' || registered) && (
                <button
                  onClick={handleClose}
                  className="w-full h-12 rounded-xl text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-100 ease-out active:scale-[0.97] active:shadow-inner shadow-lg shadow-neutral-950/10 hover:brightness-105"
                  style={{ backgroundColor: accentColor }}
                >
                  {promo.buttonText}
                  <ArrowRight size={16} />
                </button>
              )}

              {/* Inline close option */}
              <div className="text-center mt-4">
                <button
                  onClick={handleClose}
                  className="text-xs text-neutral-400 hover:text-neutral-600 font-bold uppercase tracking-wider transition-colors"
                >
                  Cerrar
                </button>
              </div>

              {/* Terms & Conditions */}
              {promo.termsText && (
                <p className="text-[10px] text-neutral-400 text-center mt-6 leading-relaxed px-2 border-t border-neutral-100 pt-4">
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