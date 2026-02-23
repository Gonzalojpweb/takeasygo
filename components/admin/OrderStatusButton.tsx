'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NEXT_STATUS: Record<string, { label: string; value: string; color: string } | null> = {
  pending: { label: 'Confirmar', value: 'confirmed', color: 'bg-primary shadow-primary/20 hover:bg-primary/90' },
  confirmed: { label: 'Empezar Preparación', value: 'preparing', color: 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600' },
  preparing: { label: 'Marcar como Listo', value: 'ready', color: 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' },
  ready: { label: 'Entregado', value: 'delivered', color: 'bg-zinc-800 shadow-zinc-800/20 hover:bg-zinc-900 rounded-xl' },
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
      className={cn(
        "mt-3 text-white font-bold px-6 h-10 rounded-xl transition-all active:scale-95 shadow-lg group",
        next.color
      )}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {next.label}
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </>
      )}
    </Button>
  )
}