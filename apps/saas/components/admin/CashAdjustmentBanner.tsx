'use client'

import { useEffect, useState } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTenantSlug } from '@/hooks/useTenantSlug'
import { CashAdjustmentModal } from './CashAdjustmentModal'

interface OrphanedOrder {
  orderId: string
  orderNumber: string
  total: number
  createdAt: string
  customerName: string
}

interface ReconciliationSummary {
  count: number
  totalAmount: number
  orders: OrphanedOrder[]
}

export function CashAdjustmentBanner() {
  const tenantSlug = useTenantSlug()
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  async function fetchSummary() {
    try {
      const res = await fetch(`/${tenantSlug}/cash-reconciliation?days=7`)
      if (res.ok) {
        const data = await res.json()
        setSummary(data)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tenantSlug) fetchSummary()
  }, [tenantSlug])

  if (loading || !summary || summary.count === 0 || dismissed) return null

  const formattedTotal = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(summary.totalAmount / 100)

  return (
    <>
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>Efectivo no cobrado</AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Hay <strong>{summary.count}</strong> pedido(s) en efectivo confirmados pero no cobrados
            de los últimos 7 días. Monto total: <strong>{formattedTotal}</strong>.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              Ajustar pedidos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
            >
              Descartar
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <CashAdjustmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        orders={summary.orders}
        onSuccess={() => {
          setModalOpen(false)
          fetchSummary()
        }}
      />
    </>
  )
}
