'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const NEXT_STATUS: Record<string, { label: string; value: string; color: string } | null> = {
  awaiting_payment: null,
  awaiting_confirmation: { label: 'Confirmar transferencia', value: 'confirmed', color: 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700' },
  pending: { label: 'Confirmar', value: 'confirmed', color: 'bg-primary shadow-primary/20 hover:bg-primary/90' },
  confirmed: { label: 'Empezar Preparación', value: 'preparing', color: 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600' },
  preparing: { label: 'Marcar como Listo', value: 'ready', color: 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' },
  ready: { label: 'Entregado', value: 'delivered', color: 'bg-zinc-800 shadow-zinc-800/20 hover:bg-zinc-900' },
  ready_delivery: { label: 'Enviar', value: 'en_ruta', color: 'bg-sky-500 shadow-sky-500/20 hover:bg-sky-600' },
  en_ruta: { label: 'Marcar Llegado', value: 'arrived', color: 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600' },
  arrived: { label: 'Confirmar Entrega', value: 'delivered', color: 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' },
  delivered: null,
  cancelled: null,
}

const CANCELLABLE_STATUSES = ['pending', 'awaiting_confirmation', 'confirmed']

interface Props {
  orderId: string
  currentStatus: string
  tenantSlug: string
  orderMode?: string
  compact?: boolean
  posSyncStatus?: string
  paymentMethod?: string
}

export default function OrderStatusButton({ orderId, currentStatus, tenantSlug, orderMode, compact, posSyncStatus, paymentMethod }: Props) {
  const [loading, setLoading] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const router = useRouter()
  const posLocked = posSyncStatus === 'synced'

  const isTransferConfirm =
    paymentMethod === 'transfer' &&
    (currentStatus === 'awaiting_payment' || currentStatus === 'awaiting_confirmation')

  const statusKey = currentStatus === 'ready' && orderMode === 'delivery' ? 'ready_delivery' : currentStatus
  const next = isTransferConfirm
    ? { label: 'Confirmar transferencia', value: 'confirmed', color: 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700' }
    : NEXT_STATUS[statusKey]

  const canCancel = CANCELLABLE_STATUSES.includes(currentStatus)

  async function handleAdvance() {
    setLoading(true)
    try {
      const isTransferConfirmLocal = paymentMethod === 'transfer' &&
        (currentStatus === 'awaiting_payment' || currentStatus === 'awaiting_confirmation')
      const endpoint = isTransferConfirmLocal
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

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || 'Error al cancelar')
      }
      toast.success('Pedido cancelado')
      setShowCancelModal(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cancelar el pedido')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <>
      <div className={cn("flex items-center gap-2", posLocked && "cursor-not-allowed")}>
        {next && (
          <Button
            size="sm"
            className={cn(
              "text-white font-bold rounded-xl transition-all active:scale-95 shadow-md group shrink-0",
              compact ? "px-3 h-8 text-xs" : "mt-3 px-6 h-10",
              next.color,
              posLocked && "opacity-40"
            )}
            onClick={handleAdvance}
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
        )}
        {canCancel && !posLocked && (
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 font-bold rounded-xl transition-all active:scale-95 shrink-0",
              compact ? "px-2 h-8 text-[10px]" : "mt-3 px-4 h-10 text-xs"
            )}
            onClick={() => setShowCancelModal(true)}
            disabled={loading}
          >
            <X className="h-3 w-3 mr-1" />
            Cancelar
          </Button>
        )}
      </div>

      {posLocked && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/pos:block z-50">
          <div className="bg-zinc-900 text-white text-[10px] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl border border-white/10">
            Gestionado por {posSyncStatus === 'synced' ? 'el POS' : posSyncStatus} — usar panel del POS
          </div>
        </div>
      )}

      {/* Modal de confirmación de cancelación */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !cancelling && setShowCancelModal(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.div
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
                <X size={24} className="text-red-500" />
              </div>
              <h3 className="font-bold text-lg">Cancelar pedido</h3>
              <p className="text-sm opacity-60">
                El pedido se cancelará y el cliente será notificado.
                {paymentMethod === 'transfer' && (
                  <span className="block mt-1 text-amber-600 font-medium">
                    Si se confirmó la transferencia, se revertirá la comisión.
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
              >
                Volver
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sí, cancelar'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
