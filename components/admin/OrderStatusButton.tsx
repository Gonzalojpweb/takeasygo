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
  compact?: boolean
}

export default function OrderStatusButton({ orderId, currentStatus, tenantSlug, compact }: Props) {
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

      const data = await res.json()
      if (data.milestoneReached) {
        toast.success('🎉 ¡30 pedidos procesados! Tu Informe ICO está listo.', {
          duration: 8000,
          action: { label: 'Ver Informe', onClick: () => router.push(`/${tenantSlug}/admin/ico`) },
        })
      } else {
        toast.success(`Pedido actualizado a "${next!.label}"`)
      }
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
        "text-white font-bold rounded-xl transition-all active:scale-95 shadow-md group",
        compact ? "px-3 h-8 text-xs" : "mt-3 px-6 h-10",
        next.color
      )}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <>
          {next.label}
          <ArrowRight className={cn("ml-1.5 h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform", compact ? "ml-1" : "ml-2 h-4 w-4")} />
        </>
      )}
    </Button>
  )
}