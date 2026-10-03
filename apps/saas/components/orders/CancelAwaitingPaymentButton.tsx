'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
