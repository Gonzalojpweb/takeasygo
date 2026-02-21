'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const NEXT_STATUS: Record<string, { label: string; value: string } | null> = {
  pending: { label: 'Confirmar', value: 'confirmed' },
  confirmed: { label: 'Preparando', value: 'preparing' },
  preparing: { label: 'Listo', value: 'ready' },
  ready: { label: 'Entregado', value: 'delivered' },
  delivered: null,
  cancelled: null,
}

interface Props {
  orderId: string
  currentStatus: string
  tenantSlug: string
}

export default function OrderStatusButton({ orderId, currentStatus, tenantSlug }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const next = NEXT_STATUS[currentStatus]

  if (!next) return null

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next!.value }),
      })

      if (!res.ok) throw new Error('Error al actualizar')

      toast.success(`Pedido actualizado a "${next!.label}"`)
      router.refresh()
    } catch {
      toast.error('No se pudo actualizar el pedido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-2 border-zinc-600 text-zinc-300 hover:text-white hover:bg-zinc-700"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? 'Actualizando...' : next.label}
    </Button>
  )
}