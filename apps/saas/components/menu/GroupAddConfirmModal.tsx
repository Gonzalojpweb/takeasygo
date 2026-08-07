'use client'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { CheckCircle, Clock, ShoppingBag } from 'lucide-react'
import { toPesos } from '@takeasygo/business'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  myItemsCount: number
  myTotal: number
  sessionExpiresAt?: string
  onClose?: () => void
}

function getTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expirada'
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function GroupAddConfirmModal({
  open, onOpenChange, itemName, myItemsCount, myTotal, sessionExpiresAt, onClose,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-6 text-center">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-in zoom-in-100 duration-300">
              <CheckCircle size={36} className="text-emerald-600" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold">
            ¡Recibido en el grupo!
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            <span><span className="font-medium text-foreground">{itemName}</span> fue agregado al pedido grupal.</span>
            <span className="block mt-2">
              Tu pedido fue recibido por la empresa. Cuando el administrador confirme el pedido grupal, se enviará al restaurante.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/40 rounded-xl p-4 mt-2 space-y-2 text-left">
          <div className="flex items-center gap-2 text-sm">
            <ShoppingBag size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground">Tus items: <strong>{myItemsCount}</strong> · <strong>${toPesos(myTotal).toLocaleString('es-AR')}</strong></span>
          </div>
          {sessionExpiresAt && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={16} className="text-muted-foreground" />
              <span className="text-muted-foreground">Tiempo restante: <strong>{getTimeRemaining(sessionExpiresAt)}</strong></span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => { onClose?.(); onOpenChange(false) }}
            className="flex-1 py-3 rounded-xl bg-muted text-muted-foreground font-bold text-sm hover:bg-muted/80 transition-all active:scale-95"
          >
            Cerrar
          </button>
          <button
            onClick={() => { onClose?.(); onOpenChange(false) }}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-95"
          >
            Seguir agregando
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
