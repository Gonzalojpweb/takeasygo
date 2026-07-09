'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NEXT_STATUS: Record<string, { label: string; value: string; color: string } | null> = {
  awaiting_payment: null, // Solo puede cambiar via webhook de Mercado Pago
  awaiting_confirmation: { label: 'Confirmar transferencia', value: 'confirmed', color: 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700' },
  pending: { label: 'Confirmar', value: 'confirmed', color: 'bg-primary shadow-primary/20 hover:bg-primary/90' },
  confirmed: { label: 'Empezar Preparación', value: 'preparing', color: 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600' },
  preparing: { label: 'Marcar como Listo', value: 'ready', color: 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' },
  ready: { label: 'Entregado', value: 'delivered', color: 'bg-zinc-800 shadow-zinc-800/20 hover:bg-zinc-900 rounded-xl' },
  en_ruta: { label: 'Marcar Llegado', value: 'arrived', color: 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600' },
  arrived: { label: 'Confirmar Entrega', value: 'delivered', color: 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' },
  delivered: null,
  cancelled: null,
}

interface Props {
  orderId: string
  currentStatus: string
  tenantSlug: string
  compact?: boolean
  posSyncStatus?: string  // 'not_applicable' | 'pending' | 'synced' | 'failed'
}

export default function OrderStatusButton({ orderId, currentStatus, tenantSlug, compact, posSyncStatus }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const next = NEXT_STATUS[currentStatus]
  const posLocked = posSyncStatus === 'synced'

  if (!next) return null

  async function handleClick() {
    setLoading(true)
    try {
      const isTransferConfirm = currentStatus === 'awaiting_confirmation'
      const endpoint = isTransferConfirm
        ? `/api/${tenantSlug}/orders/${orderId}/confirm-transfer-admin`
        : `/api/${tenantSlug}/orders/${orderId}/status`
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next!.value }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || 'Error al actualizar')
      }

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
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo actualizar el pedido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("relative group/pos", posLocked && "cursor-not-allowed")}>
      <Button
        size="sm"
        className={cn(
          "text-white font-bold rounded-xl transition-all active:scale-95 shadow-md group",
          compact ? "px-3 h-8 text-xs" : "mt-3 px-6 h-10",
          next.color,
          posLocked && "opacity-40"
        )}
        onClick={handleClick}
        disabled={loading || posLocked}
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
      {posLocked && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/pos:block z-50">
          <div className="bg-zinc-900 text-white text-[10px] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl border border-white/10">
            Gestionado por {posSyncStatus === 'synced' ? 'el POS' : posSyncStatus} — usar panel del POS
          </div>
        </div>
      )}
    </div>
  )
}