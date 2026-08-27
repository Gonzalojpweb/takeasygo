'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useTenantSlug } from '@/hooks/useTenantSlug'
import { toast } from 'sonner'

interface OrphanedOrder {
  orderId: string
  orderNumber: string
  total: number
  createdAt: string
  customerName: string
}

interface CashAdjustmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orders: OrphanedOrder[]
  onSuccess?: () => void
}

export function CashAdjustmentModal({ open, onOpenChange, orders, onSuccess }: CashAdjustmentModalProps) {
  const tenantSlug = useTenantSlug()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  function toggle(orderId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(orders.map(o => o.orderId)))
  }

  async function handleSubmit() {
    if (selected.size === 0) return
    setSubmitting(true)
    let failed = 0
    try {
      for (const orderId of selected) {
        const res = await fetch(`/${tenantSlug}/cash-adjustment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            type: 'cash_order_not_collected',
          }),
        })
        if (!res.ok) failed++
      }
      if (failed > 0) {
        toast.error(`Error al ajustar ${failed} pedido(s). Intentalo de nuevo.`)
      } else {
        onOpenChange(false)
        onSuccess?.()
      }
    } catch {
      toast.error('Error de red al ajustar pedidos')
    } finally {
      setSubmitting(false)
    }
  }

  const totalSelected = orders
    .filter(o => selected.has(o.orderId))
    .reduce((sum, o) => sum + o.total, 0)

  const formattedTotal = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(totalSelected / 100)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar pedidos de efectivo no cobrados</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Checkbox
              checked={selected.size === orders.length}
              onCheckedChange={() => selected.size === orders.length ? setSelected(new Set()) : selectAll()}
            />
            <span className="text-sm font-medium">Seleccionar todos</span>
          </div>
          {orders.map(order => (
            <div key={order.orderId} className="flex items-center gap-2 py-1">
              <Checkbox
                checked={selected.has(order.orderId)}
                onCheckedChange={() => toggle(order.orderId)}
              />
              <div className="flex-1 text-sm">
                <span className="font-mono">{order.orderNumber}</span>
                <span className="ml-2 text-muted-foreground">{order.customerName}</span>
              </div>
              <span className="text-sm font-medium tabular-nums">
                ${(order.total / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selected.size} seleccionado(s) — {formattedTotal}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={selected.size === 0 || submitting}
              >
                {submitting ? 'Procesando...' : 'Marcar como no cobrado'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
