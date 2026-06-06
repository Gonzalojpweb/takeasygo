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

  const accentColor = styles.primaryColor || '#10b981'

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
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="relative w-full max-w-[380px] bg-white shadow-2xl overflow-hidden"
            style={{ borderRadius: styles.borderRadius || '28px' }}
          >
            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-50 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow-md text-slate-500 hover:text-slate-900 transition-all active:scale-90"
            >
              <X size={20} strokeWidth={3} />
            </button>

            {/* Header con gradiente mejorado */}
            <div
              className="h-52 relative flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${accentColor} 0%, #065f46 100%)`
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(at_30%_20%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />

              <div className="relative flex flex-col items-center text-center px-8">
                {promo.imageUrl ? (
                  <img
                    src={promo.imageUrl}
                    alt={promo.title}
                    className="w-24 h-24 object-cover rounded-2xl shadow-xl border-4 border-white/30 mb-5"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/30 mb-5">
                    {promo.type === 'discount' && <Gift size={52} className="text-white" />}
                    {promo.type === 'loyalty' && <Star size={52} className="text-white fill-white" />}
                    {promo.type === 'info' && <Info size={52} className="text-white" />}
                  </div>
                )}

                <p className="text-white/90 text-xs font-bold tracking-[2px] uppercase mb-1">{promo.badgeLabel || 'SOLO POR HOY'}</p>
                
                {promo.type === 'discount' ? (
                  <div className="flex items-baseline justify-center gap-1 text-white">
                    <span className="text-6xl font-black tracking-tighter">{promo.discountPercentage}</span>
                    <span className="text-4xl font-bold -mt-2">%</span>
                    <span className="text-3xl font-semibold opacity-90 ml-2">{promo.offLabel || 'OFF'}</span>
                  </div>
                ) : (
                  <h2 className="text-3xl font-bold text-white leading-tight">{promo.title}</h2>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-8 text-center">
              <h3 className="text-2xl font-bold text-slate-900 mb-3">
                {promo.title}
              </h3>

              {/* Aviso importante sobre descuentos exclusivos para takeaway */}
              {promo.type === 'discount' && (
                <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl">
                  <p className="text-amber-900 font-bold text-sm leading-tight">
                    ⚠️ {promo.takeawayWarningTitle || 'DESCUENTO EXCLUSIVO PARA TAKEAWAY'}
                  </p>
                  <p className="text-amber-800 text-xs mt-1 leading-relaxed">
                    {promo.takeawayWarningText || 'No aplicable para consumir en el local'}
                  </p>
                </div>
              )}

              <p className="text-slate-600 leading-relaxed mb-8">
                {promo.type === 'discount'
                  ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                  : promo.subtitle}
              </p>

              {/* Formulario Loyalty */}
              {promo.type === 'loyalty' && !registered && (
                <form onSubmit={handleRegister} className="space-y-4 mb-8">
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
                      className="flex-1 h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:border-emerald-400 focus:bg-white outline-none"
                    />
                  </div>

                  {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-14 rounded-2xl text-white font-bold text-lg shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.985] disabled:opacity-70"
                    style={{ backgroundColor: accentColor }}
                  >
                    {registering ? (promo.loadingText || 'Procesando...') : promo.buttonText}
                  </button>
                </form>
              )}

              {/* Success State */}
              {registered && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-8 px-6 bg-emerald-50 rounded-3xl border border-emerald-100 mb-8"
                >
                  <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  <p className="text-2xl font-bold text-emerald-900">{loyaltyMsg?.successTitle || '¡Registro exitoso!'}</p>
                  <p className="text-emerald-700 mt-1">{loyaltyMsg?.successMessage || 'Bienvenido al club'}</p>
                </motion.div>
              )}

              {/* Botón principal para otros tipos */}
              {(promo.type !== 'loyalty' || registered) && (
                <button
                  onClick={handleClose}
                  className="w-full h-14 rounded-2xl text-white font-bold text-lg shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-3 transition-all active:scale-[0.985]"
                  style={{ backgroundColor: accentColor }}
                >
                  {promo.buttonText}
                  <ArrowRight size={22} />
                </button>
              )}

              <button
                onClick={handleClose}
                className="mt-6 text-sm text-slate-400 hover:text-slate-500 font-medium transition-colors"
              >
                Cerrar
              </button>

              {promo.termsText && (
                <p className="text-[10px] text-slate-400 mt-8 leading-relaxed px-4">
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