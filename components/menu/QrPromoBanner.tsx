'use client'

import { useState, useEffect } from 'react'
import { X, ShoppingBag, Percent, ArrowRight, Star, CheckCircle2, Users, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

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
  const [form, setForm] = useState({ name: '', phone: '' })
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Solo mostrar si viene de QR
    if (!source.toLowerCase().includes('qr')) {
      setLoading(false)
      return
    }

    checkPromo()
    fetchStyles()
  }, [tenantSlug, source])

  const checkPromo = async () => {
    if (!source) {
      console.log(' [QR Promo] No se detectó parámetro "source" en la URL.')
      setLoading(false)
      return
    }

    if (!source.toLowerCase().includes('qr') && source !== 'qr-test') {
      console.log(' [QR Promo] El "source" no contiene la palabra "qr":', source)
      setLoading(false)
      return
    }

    try {
      console.log(' [QR Promo] Verificando elegibilidad para:', source)
      const res = await fetch(`/api/${tenantSlug}/qr-promo?source=${source}`)
      const data = await res.json()
      
      if (data.show && data.promo) {
        console.log(' [QR Promo] ¡Promo activada!', data.promo.title)
        setPromo(data.promo)
        setShow(true)
        // Guardar en sesión para el checkout
        sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
          discountPercentage: data.promo.discountPercentage,
          tenantSlug
        }))
      } else {
        console.log(' [QR Promo] El servidor decidió no mostrarla. Razón:', data.reason || 'Desconocida')
      }
    } catch (e) {
      console.error(' [QR Promo] Error al verificar promo:', e)
    } finally {
      setLoading(false)
    }
  }

  const fetchStyles = async () => {
    try {
      const res = await fetch('/api/superadmin/qr-promo-defaults')
      if (!res.ok) throw new Error('Failed to fetch global styles')
      const data = await res.json()
      if (data.qrPromoStyles) {
        setStyles(data.qrPromoStyles)
      } else {
        throw new Error('No styles found in response')
      }
    } catch (e) {
      console.warn(' [QR Promo] Usando estilos por defecto debido a error:', e)
      setStyles({
        primaryColor: '#F74211',
        backgroundColor: '#FFF5F0',
        badgeColor: '#F74211',
        borderRadius: '24px',
        buttonColor: '#F74211',
      })
    }
  }

  const handleClose = async () => {
    setShow(false)
    // Registrar que el usuario vio la promo
    try {
      await fetch(`/api/${tenantSlug}/qr-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
    } catch (e) {
      console.error('Error recording promo view:', e)
    }
  }

  const handleCTA = () => {
    if (promo?.type === 'loyalty') return // Form handles it
    handleClose()
    // Scroll al menú o sección de takeaway
    const menuSection = document.getElementById('takeaway-section') || document.getElementById('menu-grid')
    if (menuSection) {
      menuSection.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.phone) return
    
    setRegistering(true)
    setError('')
    
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source: 'qr_scan'
        }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        if (data.code === 'ALREADY_REGISTERED') {
          setError('Este número ya es parte del club.')
        } else {
          setError(data.error || 'Ocurrió un error al registrarse')
        }
        return
      }
      
      setRegistered(true)
      setTimeout(() => handleClose(), 3000)
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
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="relative w-full max-w-md overflow-hidden"
          >
            {/* Card principal - Estilos dinámicos del superadmin */}
              <div 
                className="relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
                style={{ 
                  background: `rgba(255, 255, 255, 0.95)`,
                  backdropFilter: 'blur(20px)',
                  borderRadius: styles.borderRadius,
                  border: `1px solid rgba(0, 0, 0, 0.05)`,
                }}
              >
                {/* Header decorativo con gradiente sutil */}
                <div 
                  className="h-1.5 w-full"
                  style={{ background: `linear-gradient(90deg, ${styles.primaryColor}, ${styles.badgeColor})` }}
                />
              
              {/* Botón cerrar */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 hover:bg-white transition-colors shadow-sm"
              >
                <X size={18} className="text-gray-500" />
              </button>
 
              {/* Contenido */}
              <div className="p-6 pt-8 text-center flex flex-col items-center">
                {/* Badge dinámico */}
                {promo.type === 'discount' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5 shadow-sm border border-white/20"
                    style={{ backgroundColor: styles.badgeColor, color: 'white' }}
                  >
                    <Percent size={14} className="stroke-[3]" />
                    <span className="font-black text-xs uppercase tracking-tight">
                      {promo.discountPercentage}% OFF
                    </span>
                  </motion.div>
                )}

                {promo.type === 'loyalty' && (
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5 bg-zinc-950 text-white shadow-lg border border-white/10">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    <span className="font-black text-[10px] uppercase tracking-[0.15em]">Club de Fidelidad</span>
                  </div>
                )}

                {promo.type === 'info' && (
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5 bg-blue-600 text-white shadow-md">
                    <Info size={14} className="stroke-[3]" />
                    <span className="font-black text-[10px] uppercase tracking-[0.15em]">Info Importante</span>
                  </div>
                )}
 
                {/* Título */}
                <h2 
                  className="text-3xl font-black mb-3 tracking-tight leading-none"
                  style={{ color: '#0F172A' }}
                >
                  {promo.title}
                </h2>
 
                {/* Subtítulo */}
                <p className="text-sm text-slate-600 mb-8 leading-relaxed max-w-[300px] font-medium">
                  {promo.type === 'discount' 
                    ? promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)
                    : promo.subtitle}
                </p>

                {/* UI específica por tipo */}
                {promo.type === 'loyalty' ? (
                  <div className="w-full space-y-4 mb-6">
                    {registered ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center"
                      >
                        <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                          <CheckCircle2 className="text-white" />
                        </div>
                        <p className="font-bold text-emerald-900">¡Bienvenido al Club!</p>
                        <p className="text-sm text-emerald-700 mt-1">Ya sos parte. Redirigiendo...</p>
                      </motion.div>
                    ) : (
                      <form onSubmit={handleRegister} className="space-y-3">
                        <div className="space-y-1 text-left">
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre Completo</label>
                          <input 
                            required
                            type="text"
                            placeholder="Ej: Juan Pérez"
                            value={form.name}
                            onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          />
                        </div>
                        <div className="space-y-1 text-left">
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Teléfono (WhatsApp)</label>
                          <input 
                            required
                            type="tel"
                            placeholder="Ej: +54 9 11 ..."
                            value={form.phone}
                            onChange={e => setForm(s => ({ ...s, phone: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          />
                        </div>
                        
                        {error && (
                          <motion.p 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xs text-red-600 font-medium bg-red-50 py-2 rounded-lg"
                          >
                            {error}
                          </motion.p>
                        )}

                        <button
                          type="submit"
                          disabled={registering}
                          className="w-full py-4 rounded-xl font-bold text-white text-lg flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
                          style={{ backgroundColor: styles.buttonColor }}
                        >
                          {registering ? 'Registrando...' : promo.buttonText}
                          <ArrowRight size={20} />
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Imagen decorativa / Icono (Solo para no-loyalty) */}
                    <div className="flex justify-center mb-10">
                      <motion.div
                        initial={{ y: 10 }}
                        animate={{ y: [0, -8, 0] }}
                        transition={{ 
                          duration: 3, 
                          repeat: Infinity, 
                          ease: 'easeInOut' 
                        }}
                        className="relative w-28 h-28"
                      >
                        <div 
                          className="absolute inset-0 rounded-3xl rotate-6 opacity-10"
                          style={{ backgroundColor: styles.primaryColor }}
                        />
                        <div 
                          className="absolute inset-0 rounded-3xl -rotate-3 opacity-10"
                          style={{ backgroundColor: styles.primaryColor }}
                        />
                        <div 
                          className="absolute inset-0 rounded-3xl flex items-center justify-center shadow-xl border border-white/50"
                          style={{ 
                            background: `linear-gradient(135deg, ${styles.primaryColor}, ${styles.badgeColor})`,
                          }}
                        >
                          {promo.type === 'discount' ? <ShoppingBag size={42} className="text-white" /> : <Info size={42} className="text-white" />}
                        </div>
                        {promo.type === 'discount' && (
                          <div 
                            className="absolute -top-3 -right-3 w-12 h-12 rounded-full flex flex-col items-center justify-center text-white shadow-2xl border-2 border-white"
                            style={{ backgroundColor: styles.badgeColor }}
                          >
                            <span className="text-[10px] font-black leading-none">OFF</span>
                            <span className="text-base font-black leading-none">-{promo.discountPercentage}%</span>
                          </div>
                        )}
                      </motion.div>
                    </div>

                    {/* CTA Button */}
                    <motion.button
                      whileHover={{ scale: 1.03, translateY: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleCTA}
                      className="w-full py-5 rounded-2xl font-black text-white text-lg flex items-center justify-center gap-3 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.3)] transition-all uppercase tracking-tight"
                      style={{ backgroundColor: styles.buttonColor }}
                    >
                      {promo.buttonText}
                      <ArrowRight size={22} className="stroke-[3]" />
                    </motion.button>
                  </>
                )}

                {/* Botón cerrar secundario */}
                {!registered && (
                  <button
                    onClick={handleClose}
                    className="w-full mt-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cerrar y continuar
                  </button>
                )}

                {/* Términos */}
                <p className="text-[10px] text-gray-400 text-center mt-4">
                  {promo.termsText}
                </p>
              </div>

              {/* Footer decorativo con pattern */}
              <div 
                className="h-1 w-full"
                style={{ 
                  background: `repeating-linear-gradient(
                    45deg,
                    ${styles.primaryColor},
                    ${styles.primaryColor} 10px,
                    ${styles.primaryColor} 10px,
                    ${styles.primaryColor} 20px
                  )`
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
