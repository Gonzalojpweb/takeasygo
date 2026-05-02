'use client'

import { useState, useEffect } from 'react'
import { X, ShoppingBag, Percent, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

interface QrPromoData {
  isEnabled: boolean
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
    try {
      const res = await fetch(`/api/${tenantSlug}/qr-promo?source=${source}`)
      const data = await res.json()
      
      if (data.show && data.promo) {
        setPromo(data.promo)
        setShow(true)
        // Guardar en sesión para el checkout
        sessionStorage.setItem('tgo-active-qr-promo', JSON.stringify({
          discountPercentage: data.promo.discountPercentage,
          tenantSlug
        }))
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
      if (data.qrPromoStyles) {
        setStyles(data.qrPromoStyles)
      }
    } catch (e) {
      console.error('Error fetching styles:', e)
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
    handleClose()
    // Scroll al menú o sección de takeaway
    const menuSection = document.getElementById('takeaway-section') || document.getElementById('menu-grid')
    if (menuSection) {
      menuSection.scrollIntoView({ behavior: 'smooth' })
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
              className="relative overflow-hidden shadow-2xl"
              style={{ 
                background: `linear-gradient(135deg, ${styles.backgroundColor} 0%, #FFFFFF 50%, ${styles.backgroundColor} 100%)`,
                borderRadius: styles.borderRadius,
              }}
            >
              {/* Header decorativo */}
              <div 
                className="h-2 w-full"
                style={{ backgroundColor: styles.primaryColor }}
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
                {/* Badge de descuento */}
                {promo.discountPercentage > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4"
                    style={{ backgroundColor: styles.badgeColor, color: 'white' }}
                  >
                    <Percent size={16} />
                    <span className="font-bold text-sm">
                      {promo.discountPercentage}% OFF
                    </span>
                  </motion.div>
                )}
 
                {/* Título */}
                <h2 
                  className="text-2xl font-bold mb-2"
                  style={{ color: '#1A1A1A' }}
                >
                  {promo.title}
                </h2>
 
                {/* Subtítulo */}
                <p className="text-base text-gray-600 mb-6 leading-relaxed max-w-[280px]">
                  {promo.subtitle.replace('{discount}', promo.discountPercentage > 0 ? `${promo.discountPercentage}%` : '')}
                </p>

                {/* Imagen decorativa / Icono */}
                <div className="flex justify-center mb-6">
                  <motion.div
                    initial={{ y: 10 }}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ 
                      duration: 2, 
                      repeat: Infinity, 
                      ease: 'easeInOut' 
                    }}
                    className="relative w-32 h-32"
                  >
                    {/* Círculo de fondo */}
                    <div 
                      className="absolute inset-0 rounded-full opacity-20"
                      style={{ backgroundColor: styles.primaryColor }}
                    />
                    <div 
                      className="absolute inset-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: styles.primaryColor }}
                    >
                      <ShoppingBag size={48} className="text-white" />
                    </div>
                    {/* Elementos decorativos */}
                    <div 
                      className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg"
                      style={{ backgroundColor: styles.primaryColor }}
                    >
                      -{promo.discountPercentage}%
                    </div>
                  </motion.div>
                </div>

                {/* CTA Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCTA}
                  className="w-full py-4 rounded-xl font-semibold text-white text-lg flex items-center justify-center gap-2 shadow-lg transition-shadow hover:shadow-xl"
                  style={{ backgroundColor: styles.buttonColor }}
                >
                  {promo.buttonText}
                  <ArrowRight size={20} />
                </motion.button>

                {/* Botón cerrar secundario */}
                <button
                  onClick={handleClose}
                  className="w-full mt-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cerrar y continuar
                </button>

                {/* Términos */}
                <p className="text-xs text-gray-400 text-center mt-4">
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
