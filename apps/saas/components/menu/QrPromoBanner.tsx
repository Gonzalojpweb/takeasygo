'use client'

import { useState, useEffect, useRef } from 'react'
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
  const resolvedSlug = useRef<string>('')
  const resolvedLocationId = useRef<string | null>(null)

  useEffect(() => {
    checkPromo()
    const interval = setInterval(checkPromo, 30000)
    return () => clearInterval(interval)
  }, [tenantSlug, source, promoSlug])

  const checkPromo = async () => {
    let effectiveSource = source
    let effectiveLocationId: string | null = null
    if (!effectiveSource && typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      const locationId = pathParts[3]
      if (locationId && locationId.length === 24) {
        effectiveSource = 'qr-auto'
        effectiveLocationId = locationId
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
        const slug = data.resolvedSlug || promoSlug
        resolvedSlug.current = slug
        resolvedLocationId.current = effectiveLocationId

        setPromo(data.promo)
        setShow(true)
        if (data.loyaltyMessaging) setLoyaltyMsg(data.loyaltyMessaging)
        if (data.promo.type === 'discount') {
          sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
            discountPercentage: data.promo.discountPercentage,
            tenantSlug,
            checkoutDiscountLabel: data.promo.checkoutDiscountLabel || 'Descuento QR',
            promoSlug: slug || undefined,
            source: source || undefined,
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
      body: JSON.stringify({
        source,
        promoSlug: resolvedSlug.current || undefined,
      }),
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
          ...(resolvedLocationId.current ? { locationId: resolvedLocationId.current } : {}),
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

  if (loading || !show || !promo) return null

  const isDiscount = promo.type === 'discount'
  const isLoyalty = promo.type === 'loyalty'

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-10">

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="relative min-w-[80%] bg-white dark:bg-neutral-900 rounded-[18px] h-[60vh] overflow-y-auto"
          >

            <div className="bg-[#F74211] rounded-t-[20px] p-6 text-center">
              <div className="flex items-center justify-between mb-6">
                <div className="w-full flex items-center justify-evenly gap-4">
                  <div className="w-20 h-30 rounded-[10px] overflow-hidden bg-[#F74211] flex items-center justify-center flex-shrink-0">
                    <img src="/tgoicon-192.png" alt="TakeAsyGo" className="object-cover" />
                  </div>
                  <span className="text-[14px] font-black tracking-[0.1em] text-white uppercase">
                    TakeAsyGo
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                  aria-label="Cerrar"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F74211]">
                {promo.badgeLabel || 'Pedí desde la app'}
              </p>

              <h3 className="text-[20px] font-black text-white leading-tight tracking-tight w-[75%]">
                {renderTitle(promo.title)}
              </h3>
            </div>

            <div className="flex flex-col items-center gap-6 h-[70%]">
              <div className="flex flex-wrap items-center">
                <span className="text-[20px] relative top-[20px] font-black uppercase tracking-[0.1em] text-[#F74211] bg-[#F74211]/10 rounded-full">
                  Oferta especial
                </span>
                {isDiscount && (
                  <span className="text-[10px] font-black text-white bg-emerald-500 px-3 py-1 rounded-full">
                    {promo.discountPercentage}% OFF
                  </span>
                )}
              </div>

              <p className="text-[18px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {isDiscount
                  ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                  : promo.subtitle}
              </p>

              {isDiscount && (
                <div className="flex gap-3 items-start rounded-2xl p-4 bg-[#F74211]/5 dark:bg-neutral-800 border border-[#F74211]/15 dark:border-neutral-700">
                  <Info size={18} className="text-[#F74211] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
                      {promo.takeawayWarningTitle || 'Exclusivo para takeaway'}
                    </p>
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-1 leading-normal">
                      {promo.takeawayWarningText || 'Válido solo para pedidos para llevar.'}
                    </p>
                  </div>
                </div>
              )}

              {isLoyalty && !registered && (
                <form onSubmit={handleRegister} className="flex flex-col gap-3">
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
                  {error && <p className="text-[12px] text-red-500">{error}</p>}
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

              {isLoyalty && registered && (
                <div className="flex flex-col items-center text-center py-2">
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

              {!isLoyalty && (
                <button
                  onClick={handleClose}
                  className="min-w-[60%] h-10 bg-[#F74211] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:bg-[#E03A0E] active:scale-[0.985] shadow-lg shadow-[#F74211]/25"
                >
                  {promo.buttonText}
                  <ArrowRight size={16} />
                </button>
              )}

              <button
                onClick={handleClose}
                className="text-[14px] font-semibold text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors text-center w-full"
              >
                Seguir navegando
              </button>

              {promo.termsText && (
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 text-center leading-relaxed">
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