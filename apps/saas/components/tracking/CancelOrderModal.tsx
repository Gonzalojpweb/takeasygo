'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, AlertTriangle, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onCancelled: () => void
  tenantSlug: string
  orderId: string
  trackingToken: string
  orderNumber: string
  primaryColor: string
  items: { name: string; quantity: number }[]
  total: number
}

export default function CancelOrderModal({
  open,
  onClose,
  onCancelled,
  tenantSlug,
  orderId,
  trackingToken,
  orderNumber,
  primaryColor,
  items,
  total,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cancelled, setCancelled] = useState(false)

  async function handleCancel() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/cancel-by-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tracking-token': trackingToken,
        },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al cancelar')
      }
      setCancelled(true)
      setTimeout(() => onCancelled(), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!loading && !cancelled ? onClose : undefined}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* Modal */}
      <motion.div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-zinc-300" />
        </div>

        {!cancelled ? (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Cancelar pedido</h3>
                  <p className="text-xs opacity-50">#{orderNumber}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={loading}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors disabled:opacity-40"
              >
                <X size={16} className="text-zinc-500" />
              </button>
            </div>

            {/* Resumen del pedido */}
            <div className="rounded-2xl bg-zinc-50 p-4 space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="opacity-70">{item.quantity}x {item.name}</span>
                </div>
              ))}
              <div className="border-t border-zinc-200 pt-2 flex justify-between font-bold text-sm">
                <span>Total</span>
                <span>${total.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Advertencia */}
            <p className="text-sm opacity-60 text-center leading-relaxed">
              Si cancelás, el pedido se eliminará y el restaurante dejará de prepararlo.
            </p>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-3 rounded-2xl font-bold text-sm border border-zinc-200 hover:bg-zinc-50 transition-colors disabled:opacity-40"
              >
                Volver
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {loading ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        ) : (
          /* Estado de éxito */
          <motion.div
            className="p-6 text-center space-y-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <div>
              <p className="font-bold text-lg">Pedido cancelado</p>
              <p className="text-sm opacity-50 mt-1">
                El restaurante fue notificado. Podés hacer un nuevo pedido cuando quieras.
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
