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
    const interval = setInterval(checkPromo, 30000)
    return () => clearInterval(interval)
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
      const apiUrl = `/api/${tenantSlug}/qr-promo?source=${source}${promoSlug ? `&promo=${promoSlug}` : ''}&_=${Date.now()}`
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

  const renderTitle = (title: string) => {
    if (!title) return ''
    const dotIndex = title.indexOf('.')
    if (dotIndex > 0 && dotIndex < title.length - 1) {
      const first = title.substring(0, dotIndex + 1)
      const second = title.substring(dotIndex + 1)
      return (
        <>
          {first}
          <br />
          <span className="text-[#F74211]">{second.trim()}</span>
        </>
      )
    }
    const matchWord = ' y ganá '
    const matchIndex = title.toLowerCase().indexOf(matchWord)
    if (matchIndex > 0) {
      const first = title.substring(0, matchIndex)
      const second = title.substring(matchIndex)
      return (
        <>
          {first}
          <br />
          <span className="text-[#F74211]">{second.trim()}</span>
        </>
      )
    }
    return title
  }

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
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-[4px]"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="relative w-full max-w-sm sm:max-w-md bg-white dark:bg-neutral-900 rounded-[32px] shadow-2xl border border-neutral-200/50 dark:border-neutral-800 max-h-[85vh] overflow-y-auto"
          >
            {/* ── HEADER OSCURO ── */}
            <div className="bg-[#121212] px-6 pt-6 pb-6 relative flex flex-col min-h-[190px]">
              {/* Fila superior: logo TGO + botón cerrar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Logo TakeAsyGo */}
                  <div className="w-7 h-7 rounded-lg bg-[#F74211] flex items-center justify-center flex-shrink-0">
                    <span className="w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center relative">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F74211]" />
                    </span>
                  </div>
                  <span className="text-[11px] font-extrabold tracking-[0.12em] text-white uppercase">
                    TakeAsyGo
                  </span>
                </div>

                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 bg-neutral-900 hover:text-white transition-colors border border-neutral-800"
                  aria-label="Cerrar"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Eyebrow */}
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F74211] mt-7 mb-2">
                {promo.badgeLabel || 'Pedí desde la app'}
              </p>

              {/* Title */}
              <h3 className="text-[26px] font-black text-white leading-tight tracking-tight max-w-[65%]">
                {renderTitle(promo.title)}
              </h3>

              {/* Imagen del admin — flotando en el borde inferior derecho del header */}
              <div className="absolute bottom-6 right-6 z-10">
                {promo.imageUrl ? (
                  <div className="w-16 h-16 rounded-[20px] overflow-hidden bg-neutral-900 flex items-center justify-center border-2 border-white dark:border-neutral-900 shadow-md">
                    <img
                      src={promo.imageUrl}
                      alt={promo.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-[20px] bg-neutral-900 border-2 border-white dark:border-neutral-900 flex items-center justify-center shadow-md text-white">
                    {isDiscount && <Gift size={24} className="text-[#F74211]" />}
                    {isLoyalty && <Star size={24} className="text-[#F74211] fill-[#F74211]" />}
                    {promo.type === 'info' && <Info size={24} className="text-[#F74211]" />}
                  </div>
                )}
              </div>
            </div>

            {/* ── BODY ── */}
            <div className="px-6 py-6 bg-white dark:bg-neutral-900 flex flex-col gap-5">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#F74211] bg-[#F74211]/10 px-3 py-1 rounded-full">
                  Oferta especial
                </span>
                {isDiscount && (
                  <span className="text-[10px] font-extrabold text-white bg-emerald-500 px-3 py-1 rounded-full">
                    {promo.discountPercentage}% OFF
                  </span>
                )}
              </div>

              {/* Subtítulo / Descripción */}
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed font-medium">
                {isDiscount
                  ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                  : promo.subtitle}
              </p>

              {/* Warning takeaway */}
              {isDiscount && (
                <div className="flex gap-3 items-start rounded-2xl p-4 bg-[#FAF9F6] dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
                  <Info size={18} className="text-[#F74211] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {promo.takeawayWarningTitle || 'Exclusivo para takeaway'}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-normal">
                      {promo.takeawayWarningText || 'Válido solo para pedidos para llevar.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Formulario loyalty */}
              {isLoyalty && !registered && (
                <form onSubmit={handleRegister} className="space-y-3">
                  <input
                    required
                    type="text"
                    placeholder="Nombre completo"
                    value={form.name}
                    onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-11 px-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-[#F74211] rounded-xl text-sm transition-all outline-none text-neutral-900 dark:text-white focus:ring-1 focus:ring-[#F74211]"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Correo electrónico"
                    value={form.email}
                    onChange={e => setForm(s => ({ ...s, email: e.target.value }))}
                    className="w-full h-11 px-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-[#F74211] rounded-xl text-sm transition-all outline-none text-neutral-900 dark:text-white focus:ring-1 focus:ring-[#F74211]"
                  />
                  <div className="flex gap-2">
                    <select
                      value={form.countryCode}
                      onChange={e => setForm(s => ({ ...s, countryCode: e.target.value }))}
                      className="h-11 px-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none text-neutral-900 dark:text-white focus:border-[#F74211]"
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
                      className="flex-1 h-11 px-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-[#F74211] rounded-xl text-sm transition-all outline-none text-neutral-900 dark:text-white focus:ring-1 focus:ring-[#F74211]"
                    />
                  </div>
                  {error && (
                    <p className="text-[12px] text-red-500 pt-1">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full h-12 bg-[#F74211] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:bg-[#E03A0E] active:scale-[0.985] shadow-lg shadow-[#F74211]/25 disabled:opacity-60"
                  >
                    {registering ? (promo.loadingText || 'Registrando...') : 'Unirme al club'}
                    {!registering && <ArrowRight size={16} />}
                  </button>
                </form>
              )}

              {/* Estado de éxito loyalty */}
              {isLoyalty && registered && (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center mb-3">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                  </div>
                  <p className="text-[15px] font-bold text-neutral-900 dark:text-white">
                    {loyaltyMsg?.successTitle || '¡Listo!'}
                  </p>
                  <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1">
                    {loyaltyMsg?.successMessage || 'Ya sos parte del club.'}
                  </p>
                </div>
              )}

              {/* CTA principal (para discount e info) */}
              {!isLoyalty && (
                <button
                  onClick={handleClose}
                  className="w-full h-12 bg-[#F74211] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:bg-[#E03A0E] active:scale-[0.985] shadow-lg shadow-[#F74211]/25"
                >
                  {promo.buttonText}
                  <ArrowRight size={16} />
                </button>
              )}

              {/* Seguir navegando */}
              <button
                onClick={handleClose}
                className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors text-center w-full"
              >
                Seguir navegando
              </button>

              {/* Terms */}
              {promo.termsText && (
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1 text-center leading-relaxed">
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