'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  tenantSlug: string
  orderId: string
  label?: string
  style?: React.CSSProperties
  className?: string
}

export default function CancelAwaitingPaymentButton({
  tenantSlug,
  orderId,
  label = 'Cancelar pedido',
  style,
  className,
}: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCancel() {
    if (!confirm('¿Estás seguro de que querés cancelar este pedido?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/cancel-awaiting`, { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('Pedido cancelado')
      router.push(`/${tenantSlug}`)
    } catch {
      toast.error('No se pudo cancelar el pedido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className={className || 'w-full py-4 rounded-2xl font-bold border-2 opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30'}
      style={style || {}}
    >
      {loading ? 'Cancelando...' : label}
    </button>
  )
}
