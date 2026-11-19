'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import LikeOrderItemsModal from './LikeOrderItemsModal'

// ============================================================================
// Paso de likes en la página de calificación
// ============================================================================
// La notificación de «pedido entregado» lleva a /[tenant]/rate/[orderNumber].
// Hasta el 19/11 esa página no ofrecía likes y el único camino era el
// seguimiento. Ahora el modal de likes se abre solo una vez por pedido (misma
// marca que el seguimiento, para no preguntar dos veces) y queda el botón.
// ============================================================================

interface Props {
  items: Array<{ _id: string; name: string; quantity: number; menuItemId?: string }>
  orderId: string
  ratingToken: string
  tenantSlug: string
  tenantName: string
  primaryColor: string
}

export default function RateLikesPrompt({ items, orderId, ratingToken, tenantSlug, tenantName, primaryColor }: Props) {
  const [open, setOpen] = useState(false)
  const likeable = items.filter(it => it.menuItemId)

  useEffect(() => {
    if (likeable.length === 0) return
    const key = `tgo-like-prompt-${orderId}`
    try {
      if (localStorage.getItem(key)) return
    } catch {
      return
    }
    const timer = setTimeout(() => {
      setOpen(true)
      try { localStorage.setItem(key, '1') } catch { /* sin storage */ }
    }, 900)
    return () => clearTimeout(timer)
  }, [orderId, likeable.length])

  if (likeable.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-8 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-transform active:scale-[0.98]"
        style={{ backgroundColor: primaryColor + '18', color: primaryColor }}
      >
        <Heart size={16} style={{ fill: '#ef4444', color: '#ef4444' }} aria-hidden />
        Dale like a lo que más te gustó
      </button>
      <LikeOrderItemsModal
        open={open}
        onClose={() => setOpen(false)}
        items={likeable}
        orderId={orderId}
        ratingToken={ratingToken}
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        primaryColor={primaryColor}
      />
    </>
  )
}
