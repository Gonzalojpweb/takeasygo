'use client'

import { useEffect, useState, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Heart, Download, Camera, Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  customerName: string
  locationId: string
  tenantName: string
  tenantSlug: string
  orderNumber: string
  orderId: string
  ratingToken: string | null
  primaryColor: string
  backgroundColor: string
}

function isMobileInstagramSupported(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  const isMobile = /android|iphone|ipad|ipod/i.test(ua)
  return isMobile
}

export default function PostDeliveryCelebration({
  customerName,
  locationId,
  tenantName,
  tenantSlug,
  orderNumber,
  orderId,
  ratingToken,
  primaryColor,
  backgroundColor,
}: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [ogLoading, setOgLoading] = useState(false)
  const [ogError, setOgError] = useState(false)
  const [shared, setShared] = useState(false)
  const celebRef = useRef(false)

  // Subtle confetti on mount
  useEffect(() => {
    if (celebRef.current) return
    celebRef.current = true
    const end = Date.now() + 1000
    let raf: number
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 90,
        spread: 120,
        origin: { x: 0.5, y: 0.3 },
        colors: [primaryColor, '#facc15', '#34d399', '#f97316'],
        gravity: 0.8,
        scalar: 1.2,
      })
      if (Date.now() < end) {
        raf = requestAnimationFrame(frame)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [primaryColor])

  // Generate OG image and upload to Cloudinary for sharing
  async function handleShare() {
    setOgLoading(true)
    setOgError(false)
    try {
      const token = ratingToken
      if (!token) {
        setOgError(true)
        toast.error('No se pudo generar la imagen para compartir')
        return
      }

      // 1. Get the Cloudinary URL from our share endpoint
      const res = await fetch(
        `/api/og/share?orderId=${orderId}&token=${token}&tenantSlug=${tenantSlug}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error('Error generando imagen')

      const data = await res.json()
      const imageUrl = data.url as string
      setShareUrl(imageUrl)

      // 2. Try Web Share API first (native share sheet)
      if (navigator.share) {
        try {
          const imgRes = await fetch(imageUrl)
          const blob = await imgRes.blob()
          const file = new File([blob], 'pedido.png', { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: `Mi pedido en ${tenantName}`,
              text: `${customerName} bancó a ${tenantName} hoy 🔥`,
              files: [file],
            })
            setShared(true)
            return
          }
        } catch {
          // User cancelled or share failed — fall through to Instagram scheme
        }
      }

      // 3. Try Instagram Stories URL scheme (mobile only)
      if (isMobileInstagramSupported()) {
        const encodedUrl = encodeURIComponent(imageUrl)
        const iosUrl = `instagram-stories://share?background_image=${encodedUrl}`
        const androidUrl = `intent://share#Intent;action=com.instagram.share.ADD_TO_STORY;S.background_image=${encodedUrl};end`

        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
        const instagramUrl = isIOS ? iosUrl : androidUrl

        // Try to open Instagram directly
        const win = window.open(instagramUrl, '_blank')

        // If the scheme didn't open Instagram (no app installed), navigator.share failing is OK
        // We just show the image and let user download it
        if (win) {
          win.close() // Close blank tab that might have opened
        }

        setShared(true)
        toast.success('Abrí Instagram y creá tu historia con la imagen')
        return
      }

      // 4. Fallback: copy image URL to clipboard
      try {
        await navigator.clipboard.writeText(imageUrl)
        toast.success('Link de la imagen copiado al portapapeles')
      } catch {
        toast.success('Imagen lista para compartir')
      }
      setShared(true)
    } catch {
      setOgError(true)
      toast.error('No se pudo generar la imagen')
    } finally {
      setOgLoading(false)
    }
  }

  async function handleDownload() {
    try {
      const token = ratingToken
      if (!token) return
      const res = await fetch(
        `/api/og/share?orderId=${orderId}&token=${token}&tenantSlug=${tenantSlug}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      const a = document.createElement('a')
      a.href = data.url
      a.download = `pedido-${orderNumber}.png`
      a.click()
    } catch {
      toast.error('No se pudo descargar la imagen')
    }
  }

  return (
    <div className="mb-8 space-y-6">
      {/* Celebration header */}
      <div className="text-center space-y-2 py-4">
        <div className="text-5xl animate-bounce">🍽️</div>
        <p className="font-black text-2xl">
          ¡Pedido completado{customerName ? `, ${customerName}` : ''}!
        </p>
        <p className="text-sm opacity-60">
          Gracias por elegirnos. ¡Que lo disfrutes!
        </p>
      </div>

      {/* Compartir button */}
      <div className="space-y-3">
        {shareUrl && (
          <div className="rounded-xl overflow-hidden border">
            <img src={shareUrl} alt="Tu pedido" className="w-full" />
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleShare}
            disabled={ogLoading}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: primaryColor, color: backgroundColor }}
          >
            {ogLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : shared ? (
              <Heart size={16} className="fill-current" />
            ) : (
              <Camera size={16} />
            )}
            {ogLoading ? 'Generando...' : shared ? '¡Compartido!' : 'Compartí en Instagram Stories'}
          </button>

          <button
            onClick={handleDownload}
            className="w-12 h-12 rounded-2xl flex items-center justify-center border-2"
            style={{ borderColor: primaryColor + '40', color: primaryColor }}
            title="Descargar imagen"
          >
            <Download size={18} />
          </button>
        </div>

        {shared && !shareUrl && (
          <p className="text-xs text-center text-emerald-600 flex items-center justify-center gap-1">
            <Heart size={12} className="fill-emerald-600" /> ¡Gracias por compartir!
          </p>
        )}

        {shareUrl && shared && (
          <p className="text-xs text-center text-emerald-600 flex items-center justify-center gap-1">
            <Share2 size={12} className="fill-emerald-600" /> Imagen lista. Abrí Instagram y creá tu historia.
          </p>
        )}

        {ogError && !shareUrl && (
          <p className="text-xs text-center text-red-400">
            No se pudo generar la imagen. Podés compartir el link de seguimiento.
          </p>
        )}
      </div>

      {/* Back to menu */}
      <a
        href={`/${tenantSlug}/menu/${locationId}/takeaway`}
        className="block w-full text-center py-4 rounded-2xl font-bold text-base"
        style={{ backgroundColor: primaryColor, color: backgroundColor }}
      >
        Volver al menú
      </a>
    </div>
  )
}
