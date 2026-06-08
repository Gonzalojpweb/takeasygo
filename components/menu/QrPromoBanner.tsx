'use client'

import { useState, useEffect } from 'react'
import { X, Gift, Star, Info, ArrowRight, CheckCircle2 } from 'lucide-react'
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

interface QrPromoBannerProps {
  tenantSlug: string
}

export default function QrPromoBanner({ tenantSlug }: QrPromoBannerProps) {
  const searchParams = useSearchParams()
  const source = searchParams ? (searchParams.get('source') || '') : ''
  const promoSlug = searchParams ? (searchParams.get('promo') || '') : ''

  const [show, setShow] = useState(false)
  const [promo, setPromo] = useState<QrPromoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', phone: '', countryCode: '+54' })
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')
  const [loyaltyMsg, setLoyaltyMsg] = useState<LoyaltyMessaging | null>(null)

  useEffect(() => {
    checkPromo()
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
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: `${form.countryCode} ${form.phone}`,
          source: 'qr_scan',
        }),
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

  if (loading || !show || !promo) return null

  const isDiscount = promo.type === 'discount'
  const isLoyalty = promo.type === 'loyalty'

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">

          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-neutral-950/75 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="relative w-full max-w-[360px] bg-white dark:bg-neutral-900 rounded-[28px] overflow-hidden shadow-2xl"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
          >

            {/* ── HEADER OSCURO ── */}
            <div className="bg-neutral-950 px-5 pt-5 pb-8 relative">

              {/* Fila superior: logo TGO + botón cerrar */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  {/* Logo TakeAsyGo */}
                  <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-[#F74211] flex items-center justify-center">
                    <img
                      src="/tgoicon-192.png"
                      alt="TakeAsyGo"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // fallback si no carga la imagen
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-black tracking-[0.1em] text-white uppercase">
                    TakeAsyGo
                  </span>
                </div>

                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
                  style={{ border: '0.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)' }}
                  aria-label="Cerrar"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>

              {/* Eyebrow + Headline */}
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F74211] mb-2">
                {promo.badgeLabel || 'Pedí desde la app'}
              </p>
              <h3 className="text-[22px] font-black text-white leading-[1.15] tracking-tight">
                {promo.title}
              </h3>

              {/* Imagen del admin — flotando en el borde inferior derecho del header */}
              <div className="absolute -bottom-6 right-5 z-10">
                {promo.imageUrl ? (
                  <div
                    className="w-14 h-14 rounded-2xl overflow-hidden"
                    style={{ border: '3px solid white', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
                  >
                    <img
                      src={promo.imageUrl}
                      alt={promo.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className="w-14 h-14 rounded-2xl bg-neutral-800 flex items-center justify-center"
                    style={{ border: '3px solid white', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
                  >
                    {isDiscount && <Gift size={24} className="text-[#F74211]" />}
                    {isLoyalty && <Star size={24} className="text-[#F74211] fill-[#F74211]" />}
                    {promo.type === 'info' && <Info size={24} className="text-[#F74211]" />}
                  </div>
                )}
              </div>
            </div>

            {/* ── BODY ── */}
            <div className="px-5 pt-10 pb-6 bg-white dark:bg-neutral-900">

              {/* Badges */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[#F74211] bg-[#F74211]/10 px-3 py-1 rounded-full">
                  Oferta especial
                </span>
                {isDiscount && (
                  <span className="text-[10px] font-black text-white bg-emerald-500 px-3 py-1 rounded-full">
                    {promo.discountPercentage}% OFF
                  </span>
                )}
              </div>

              {/* Subtítulo */}
              <p className="text-[14px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-5">
                {isDiscount
                  ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                  : promo.subtitle}
              </p>

              {/* Warning takeaway */}
              {isDiscount && (
                <div
                  className="flex gap-3 rounded-2xl p-3 mb-5"
                  style={{ background: 'rgba(247,66,17,0.06)', border: '0.5px solid rgba(247,66,17,0.15)' }}
                >
                  <Info size={16} className="text-[#F74211] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[12px] font-bold text-neutral-800 dark:text-neutral-200">
                      {promo.takeawayWarningTitle || 'Exclusivo para takeaway'}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {promo.takeawayWarningText || 'Válido solo para pedidos para llevar.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Formulario loyalty */}
              {isLoyalty && !registered && (
                <form onSubmit={handleRegister} className="space-y-2 mb-5">
                  <input
                    required
                    type="text"
                    placeholder="Nombre completo"
                    value={form.name}
                    onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-11 px-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-neutral-900 dark:focus:border-white rounded-xl text-sm transition-all outline-none"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Correo electrónico"
                    value={form.email}
                    onChange={e => setForm(s => ({ ...s, email: e.target.value }))}
                    className="w-full h-11 px-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-neutral-900 dark:focus:border-white rounded-xl text-sm transition-all outline-none"
                  />
                  <div className="flex gap-2">
                    <select
                      value={form.countryCode}
                      onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                      className="h-11 px-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none"
                    >
                      <option value="+54">🇦🇷 +54</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+34">🇪🇸 +34</option>
                      <option value="+52">🇲🇽 +52</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="Teléfono"
                      value={form.phone}
                      onChange={e => setForm(s => ({ ...s, phone: e.target.value }))}
                      className="flex-1 h-11 px-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-neutral-900 dark:focus:border-white rounded-xl text-sm transition-all outline-none"
                    />
                  </div>
                  {error && (
                    <p className="text-[12px] text-red-500 pt-1">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-12 rounded-2xl text-white text-[14px] font-bold flex items-center justify-center gap-2 transition-opacity active:scale-[0.985] disabled:opacity-60"
                    style={{ background: '#F74211', boxShadow: '0 8px 20px -4px rgba(247,66,17,0.35)' }}
                  >
                    {registering ? (promo.loadingText || 'Registrando...') : 'Unirme al club'}
                    {!registering && <ArrowRight size={16} />}
                  </button>
                </form>
              )}

              {/* Estado de éxito loyalty */}
              {isLoyalty && registered && (
                <div className="flex flex-col items-center text-center py-4 mb-5">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                  </div>
                  <p className="text-[15px] font-bold text-neutral-900 dark:text-white">
                    {loyaltyMsg?.successTitle || '¡Listo!'}
                  </p>
                  <p className="text-[13px] text-neutral-500 mt-1">
                    {loyaltyMsg?.successMessage || 'Ya sos parte del club.'}
                  </p>
                </div>
              )}

              {/* CTA principal (para discount e info) */}
              {!isLoyalty && (
                <button
                  onClick={handleClose}
                  className="w-full h-12 rounded-2xl text-white text-[14px] font-bold flex items-center justify-center gap-2 transition-opacity active:scale-[0.985]"
                  style={{ background: '#F74211', boxShadow: '0 8px 20px -4px rgba(247,66,17,0.35)' }}
                >
                  {promo.buttonText}
                  <ArrowRight size={16} />
                </button>
              )}

              {/* Seguir navegando */}
              <div className="text-center mt-4">
                <button
                  onClick={handleClose}
                  className="text-[12px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 font-medium transition-colors"
                >
                  Seguir navegando
                </button>
              </div>

              {/* Terms */}
              {promo.termsText && (
                <p className="text-[10px] text-neutral-300 dark:text-neutral-600 mt-4 text-center leading-relaxed">
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