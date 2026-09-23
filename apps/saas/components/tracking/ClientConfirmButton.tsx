'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'

interface Props {
  tenantSlug: string
  orderId: string
  trackingToken: string
  orderStatus: string
  /** Timestamp of when the order entered current status (or best approximation) */
  statusTimestamp: string | null
  primaryColor: string
  backgroundColor: string
}

const STUCK_STATUSES = new Set(['preparing', 'en_ruta'])
const MINUTES_THRESHOLD = 10

export default function ClientConfirmButton({
  tenantSlug,
  orderId,
  trackingToken,
  orderStatus,
  statusTimestamp,
  primaryColor,
  backgroundColor,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Don't show if status is not eligible
  if (!STUCK_STATUSES.has(orderStatus)) return null

  // Don't show if already submitted
  if (result?.success) return null

  // Calculate stuck time — use statusTimestamp if available, otherwise skip
  const minutesStuck = statusTimestamp
    ? (Date.now() - new Date(statusTimestamp).getTime()) / 60_000
    : 0

  // For en_ruta without timestamp, we still show after a minimum wait
  // (the endpoint will validate the actual stuck time server-side)
  const canShow = orderStatus === 'en_ruta'
    ? true // Always show for en_ruta — server validates
    : minutesStuck >= MINUTES_THRESHOLD

  if (!canShow) return null

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/external-confirm`, {
        method: 'POST',
        headers: {
          'x-tracking-token': trackingToken,
        },
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, message: data.message })
        setDialogOpen(false)
      } else {
        setResult({ success: false, message: data.error || 'Error al reportar' })
        setDialogOpen(false)
      }
    } catch {
      setResult({ success: false, message: 'Error de conexión' })
      setDialogOpen(false)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div
        className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${
          result.success
            ? 'bg-green-500/5 text-green-700 border border-green-500/20'
            : 'bg-red-500/5 text-red-700 border border-red-500/20'
        }`}
      >
        {result.success ? (
          <CheckCircle className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span>{result.message}</span>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="text-xs text-muted-foreground underline underline-offset-2 opacity-60 hover:opacity-100 transition-opacity py-2"
      >
        ¿Tu pedido no avanza? Reportalo
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reportar pedido varado
            </DialogTitle>
            <DialogDescription>
              Si tu pedido lleva mucho tiempo sin avanzar, podemos alertar al restaurante
              para que lo revisen. Esto <strong>no cancela</strong> tu pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p>
              Tu pedido lleva <strong>{minutesStuck > 0 ? `${Math.round(minutesStuck)} minutos` : 'un tiempo considerable'}</strong> en
              estado <strong>{orderStatus === 'preparing' ? 'preparando' : 'en camino'}</strong>.
            </p>
            <p className="mt-1">
              Al reportar, el restaurante recibirá una notificación urgente para
              atender tu pedido.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={loading}
              style={{ backgroundColor: primaryColor, color: backgroundColor }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-1" />
              )}
              Reportar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
