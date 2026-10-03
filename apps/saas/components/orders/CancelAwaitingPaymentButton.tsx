'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { prepareCheckoutRestore } from '@/lib/cart-restore-client'

/**
 * Última salida para un pedido varado en `awaiting_payment`: cancelar.
 *
 * ── POR QUÉ NO ES SOLO UN CANCEL ────────────────────────────────────────────
 * Cancelar y que el cliente vuelva al menú significa que tiene que armar el
 * pedido entero de nuevo. Si tenía una customización o eligió una variante
 * concreta, esa información vive sólo en `order.items` — no se puede
 * recuperar desde el menú. Por eso antes de redirigir se pide el carrito
 * reconstruido y se lo deja listo en sessionStorage: el cliente vuelve al
 * checkout con SU pedido, incluyendo las customizaciones.
 *
 * Si el restore falla (token vencido, pedido sin items), se cancela igual y se
 * manda al menú: la cancelación es la prioridad, la restauración es la mejora.
 */
interface Props {
  tenantSlug: string
  orderId: string
  /** OBLIGATORIO: `cancel-awaiting` lo exige. Sin él el endpoint es público. */
  trackingToken: string | null
  label?: string
  style?: React.CSSProperties
  className?: string
}

export default function CancelAwaitingPaymentButton({
  tenantSlug,
  orderId,
  trackingToken,
  label = 'Cancelar pedido',
  style,
  className,
}: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCancel() {
    if (!confirm('¿Cancelar este pedido? No fue cobrado, así que no hay reembolso pendiente.')) return
    if (!trackingToken) {
      toast.error('No se pudo identificar tu pedido. Abrilo desde tu correo o el menú.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/cancel-awaiting`, {
        method: 'POST',
        headers: { 'x-tracking-token': trackingToken },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo cancelar el pedido')
      }
      toast.success('Pedido cancelado')

      // Tras cancelar, el pedido queda en `cancelled`: es uno de los estados que
      // `cart-restore` acepta, así que el restore se pide DESPUÉS del cancel.
      let restoreUrl: string | null = null
      try {
        const restore = await prepareCheckoutRestore({ tenantSlug, orderId, trackingToken })
        restoreUrl = restore?.url ?? null
      } catch {
        restoreUrl = null
      }

      if (restoreUrl) {
        toast.success('Armamos tu pedido de nuevo en el checkout')
        router.push(restoreUrl)
        return
      }

      router.push(`/${tenantSlug}`)
    } catch (err: any) {
      toast.error(err.message || 'No se pudo cancelar el pedido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading || !trackingToken}
      className={className || 'w-full py-4 rounded-2xl font-bold border-2 opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30'}
      style={style || {}}
    >
      {loading ? 'Cancelando...' : label}
    </button>
  )
}
