'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Clock, CheckCircle, ExternalLink } from 'lucide-react'

interface ComplianceAlert {
  _id: string
  orderId: string
  orderNumber: string
  level: 1 | 2 | 3
  fromStatus: string
  toStatus: string
  locationId: string
  triggeredAt: string
  clientConfirmed: boolean
}

interface ComplianceStatus {
  hasLevel3: boolean
  hasLevel2: boolean
  blockedLocations: string[]
  warningLocations: string[]
  alerts: ComplianceAlert[]
  total: number
}

interface Props {
  tenantSlug: string
  activeLocationId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Recibido',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  en_ruta: 'En ruta',
  arrived: 'Llegó',
  delivered: 'Entregado',
}

export function ComplianceBlockModal({
  tenantSlug,
  activeLocationId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const [status, setStatus] = useState<ComplianceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [internalOpen, setInternalOpen] = useState(false)

  const open = controlledOpen ?? internalOpen
  const onOpenChange = controlledOnOpenChange ?? setInternalOpen

  const fetchStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeLocationId) params.set('locationId', activeLocationId)
      const res = await fetch(`/api/${tenantSlug}/compliance/status?${params}`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data)

        // Auto-open if there are L3 alerts for the active location
        if (data.hasLevel3) {
          const hasBlockedForLocation = activeLocationId
            ? data.blockedLocations.includes(activeLocationId)
            : data.blockedLocations.length > 0
          if (hasBlockedForLocation) {
            setInternalOpen(true)
          }
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, activeLocationId])

  useEffect(() => {
    if (tenantSlug) {
      fetchStatus()
      const interval = setInterval(fetchStatus, 15_000) // Poll every 15s
      return () => clearInterval(interval)
    }
  }, [tenantSlug, fetchStatus])

  // Filter L3 alerts for the active location
  const blockedAlerts = status?.alerts.filter(
    (a) =>
      a.level === 3 &&
      (activeLocationId ? a.locationId === activeLocationId : true)
  ) ?? []

  const isBlocked = blockedAlerts.length > 0

  // Don't render anything if not blocked
  if (!isBlocked && !loading) return null

  return (
    <Dialog open={open} onOpenChange={isBlocked ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (isBlocked) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isBlocked) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Pedidos bloqueados
          </DialogTitle>
          <DialogDescription>
            Hay {blockedAlerts.length} pedido(s) que superaron el tiempo límite y requieren
            tu acción antes de poder continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4">
          {blockedAlerts.map((alert) => (
            <div
              key={alert._id}
              className="border border-red-500/20 rounded-xl p-4 bg-red-500/5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm">#{alert.orderNumber}</span>
                  {alert.clientConfirmed && (
                    <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-600">
                      Confirmado por cliente
                    </Badge>
                  )}
                </div>
                <Badge variant="destructive" className="text-xs">
                  L3
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Clock className="h-3 w-3" />
                <span>
                  {STATUS_LABELS[alert.fromStatus] ?? alert.fromStatus} →{' '}
                  {STATUS_LABELS[alert.toStatus] ?? alert.toStatus}
                </span>
                <span className="text-xs">
                  ({Math.round((Date.now() - new Date(alert.triggeredAt).getTime()) / 60_000)} min)
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    window.location.href = `/${tenantSlug}/admin/orders`
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Gestionar pedido
                </Button>
              </div>
            </div>
          ))}
        </div>

        {!isBlocked && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle className="h-4 w-4" />
            Todos los pedidos fueron atendidos. Podés continuar.
          </div>
        )}

        {!isBlocked && (
          <Button onClick={() => onOpenChange(false)} className="w-full">
            Continuar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
